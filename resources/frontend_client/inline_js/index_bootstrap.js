(function() {
  window.MetabaseBootstrap        = JSON.parse(document.getElementById("_metabaseBootstrap").textContent);
  window.MetabaseUserLocalization = JSON.parse(document.getElementById("_metabaseUserLocalization").textContent);
  window.MetabaseSiteLocalization = JSON.parse(document.getElementById("_metabaseSiteLocalization").textContent);
  window.MetabaseNonce            = JSON.parse(document.getElementById("_metabaseNonce").textContent);

  var configuredRoot = document.head.querySelector("meta[name='base-href']").content;
  var actualRoot = "/";

  // Add trailing slashes
  var backendPathname = document.head.querySelector("meta[name='uri']").content.replace(/\/*$/, "/");
  // e.x. "/questions/"
  var frontendPathname = window.location.pathname.replace(/\/*$/, "/");
  // e.x. "/metabase/questions/"
  if (backendPathname === frontendPathname.slice(-backendPathname.length)) {
    // Remove the backend pathname from the end of the frontend pathname
    actualRoot = frontendPathname.slice(0, -backendPathname.length) + "/";
    // e.x. "/metabase/"
  }

  if (actualRoot !== configuredRoot) {
    console.warn("Warning: the Metabase site URL basename \"" + configuredRoot + "\" does not match the actual basename \"" + actualRoot + "\".");
    console.warn("You probably want to update the Site URL setting to \"" + window.location.origin + actualRoot + "\"");
    document.getElementsByTagName("base")[0].href = actualRoot;
  }

  window.MetabaseRoot = actualRoot;
})();

(function (m, a, z, e) {
  var s, t;
  try {
    t = m.sessionStorage.getItem("maze-us");
  } catch (err) {}

  if (!t) {
    t = new Date().getTime();
    try {
      m.sessionStorage.setItem("maze-us", t);
    } catch (err) {}
  }

  s = a.createElement("script");
  s.src = z + "?apiKey=" + e;
  s.async = true;
  a.getElementsByTagName("head")[0].appendChild(s);
  m.mazeUniversalSnippetApiKey = e;
})(
  window,
  document,
  "https://snippet.maze.co/maze-universal-loader.js",
  "978cfee3-d061-4575-9977-e2ebe6e3d735",
);
