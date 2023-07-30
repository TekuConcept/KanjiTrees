# KanjiTrees
Etymological breakdown of Kanji / Chinese glyphs into their picto-/ideo-grammic parts

This is a simple app the displays the kanji characters in a tree-like breakdown of their etymological parts. It provides an interactive experience where one can move the circles out of the way to see their quick meaning. On the side, meta info is provided for on-yomi, kun-yomi, class, and brush-stroke count as well as a (currently incomplete) mnemonic. (Mnemonics are crafted after the character's etymological resemblance rather than the actual meaning of the symbol itself.)

In the future, I may add pinyin and jyutping - if I ever get around to it. I'm considering the books from [Tree of Chinese Character](https://www.chinasprout.com/shop/BLP376).

Etymology and definitions were built from several sources including wiktionary, jisho, and several other online Chinese dictionaries. More than 5000 symbols were organized by hand into a structured json file (`kanji-data.json`).

## Running the App

Simply install the modules and then run a static server in the source folder:

```sh
$ npm install
$ cd /src
$ http-server
```

You should be able to access the app via `http://localhost:8080/`.

**Note:** This app was not optimized to be responsive.
