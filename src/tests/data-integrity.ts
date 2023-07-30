
import fs from 'fs'

interface Entry {
    kanji: string,
    parts: Array<string>,
    definitions: Array<string>,
    class: string,
    notes: string,
    strokes: string,
    on_yomi?: string,
    kun_yomi?: string,
    rad?: number
}

type Dictionary = Array<Entry>

function loadjson(file: string) : Dictionary {
    let data = fs.readFileSync(file)
    try { return JSON.parse(data.toString()) as Dictionary }
    catch {
        console.error('file doesn\' exist or is invalid json')
        process.exit(1)
    }
}

function validateInfo(dict: Dictionary): boolean {
    let result = true
    for (let i = 0; i < dict.length; i++) {
        let n = dict[i]
        if (!n.kanji || typeof n.kanji !== 'string' || n.kanji.length === 0) {
            if (!n.kanji) console.warn(`${i}: kanji entry does not exist`)
            else if (typeof n.kanji !== 'string') console.warn(`${i}: kanji is not a string type`)
            else if (n.kanji.length !== 1) console.warn(`${i}: kanji length is ${n.kanji.length}`)
            result = false
        }
        if (!n.parts || !Array.isArray(n.parts)) {
            console.warn(`${i}: ${n.kanji} - 'parts' is missing or not correct`)
            result = false
        }
        else {
            for (let j = 0; j < n.parts.length; j++) {
                if (typeof n.parts[j] !== 'string' || n.parts[j].length === 0) {
                    console.warn(`${i}: ${n.kanji} => parts[${j}] - invalid part entry`)
                    result = false
                }
            }
        }
        if (!n.definitions || !Array.isArray(n.definitions)) {
            console.warn(`${i}: ${n.kanji} - 'definitions' is missing or not correct`)
            result = false
        }
        else {
            for (let j = 0; j < n.definitions.length; j++) {
                if (typeof n.definitions[j] !== 'string' || n.definitions[j].length === 0) {
                    console.warn(`${i}: ${n.kanji} => definitions[${j}] - invalid definition entry`)
                    result = false
                }
            }
        }
        if (typeof n['class'] !== 'string') {
            console.warn(`${i}: ${n.kanji} - 'class' is missing or not correct`)
            result = false
        }
        if (typeof n.notes !== 'string') {
            console.warn(`${i}: ${n.kanji} - 'notes' is missing or not correct`)
            result = false
        }
        if (typeof n.strokes !== 'string' || n.strokes.length === 0) {
            console.warn(`${i}: ${n.kanji} - 'strokes' is missing or not correct`)
            result = false
        }
        else {
            try { let m = parseInt(n.strokes) }
            catch {
                console.warn(`${i}: ${n.kanji} - 'strokes' value is not an integer`)
                result = false
            }
        }
        if (n.on_yomi) {
            if (typeof n.on_yomi !== 'string' || n.on_yomi.length === 0) {
                console.warn(`${i}: ${n.kanji} - 'on_yomi' is not correct`)
                result = false
            }
        }
        if (n.kun_yomi) {
            if (typeof n.kun_yomi !== 'string' || n.kun_yomi.length === 0) {
                console.warn(`${i}: ${n.kanji} - 'on_yomi' is not correct`)
                result = false
            }
        }
        if (n.rad) {
            if (typeof n.rad !== 'number' || n.rad === 0) {
                console.warn(`${i}: ${n.kanji} - 'rad' must be non-zero`)
                result = false
            }
        }
    }
    return result
}

function checkLUTKeys(dict: Dictionary): boolean {
    let result = true
    let missing = []
    for (let i = 0; i < dict.length; i++) {
        let n = dict[i]
        if (n.parts.length === 0) continue
        n.parts.forEach((element:any) => {
            let found = false
            for (let i = 0; i < dict.length; i++) {
                if (dict[i].kanji === element) {
                    found = true
                    break;
                }
            }
            if (!found && missing.indexOf(element) < 0) {
                console.warn(element, 'definition is missing')
                missing.push(element.trim().replace(/\r*\n*/g, ''))
                result = false
            }
        })
    }
    return result
}

function checkCircular(dict: Dictionary): boolean {
    // TODO!!
    return true
}

function main() {
    let dictionary = loadjson('./kanji-data.json')
    if (!validateInfo(dictionary))  return
    if (!checkLUTKeys(dictionary))  return
    if (!checkCircular(dictionary)) return
    console.log('All Good!')
}

main()
