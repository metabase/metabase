// check that we're both iframed, and the parent is a Metabase instance
// used for detecting if we're previewing an embed
export const IFRAMED_IN_SELF = (function () {
  try {
    return window.self !== window.parent && window.parent.METABASE;
  } catch (e) {
    return false;
  }
})();
