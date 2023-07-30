
import fs from 'fs'

export interface Entry {
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

export type Dictionary = Array<Entry>
let dictionary: Dictionary = []
let filename = './kanji-data.json'

function loadjson(file: string) : Dictionary {
    let data = fs.readFileSync(file)
    return JSON.parse(data.toString()) as Dictionary
}

function reload() {
    try {
        dictionary = loadjson(filename)
        console.log(`${filename} updated!`)
    }
    catch { console.warn(`${filename} failed to load...`) }
}

let watchdog = fs.watchFile(
    filename,
    { interval: 1000 },
    (_curr: fs.Stats, _prev: fs.Stats) => reload()
)
// watchdog.close()
reload()

export default {
    watch: watchdog,
    dict: dictionary,
    find: (kanji: string) => {
        for (let i = 0; i < dictionary.length; i++) {
            if (dictionary[i].kanji === kanji)
                return dictionary[i]
        }
    },
    check: (glyphs: string) => {
        let list = glyphs.match(/./ug) as string[]
        let result = []
        list.forEach(glyph => {
            for (let i = 0; i < dictionary.length; i++) {
                if (dictionary[i].kanji === glyph)
                    result.push(dictionary[i])
            }
        })
        return result
    }
}
