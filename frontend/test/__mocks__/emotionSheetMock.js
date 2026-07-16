/**
 * Experiment: no-op replacement for @emotion/sheet.
 *
 * Emotion inserts real CSS rules into jsdom's CSSOM on every styled-component
 * mount; jsdom parses them but computes no layout, so for most tests this is
 * pure overhead. This stub keeps emotion's bookkeeping happy while skipping
 * the insertion. Assertions that read emotion-inserted styles (toHaveStyle on
 * styled components) will no longer see them.
 */
class StyleSheet {
  constructor(options = {}) {
    this.isSpeedy = false;
    this.tags = [];
    this.ctr = 0;
    this.key = options.key || "css";
    this.container = options.container;
    this.nonce = options.nonce;
    this.prepend = options.prepend;
    this.insertionPoint = options.insertionPoint;
  }

  hydrate() {}

  insert() {
    this.ctr++;
  }

  flush() {
    this.ctr = 0;
    this.tags = [];
  }
}

module.exports = { StyleSheet };
