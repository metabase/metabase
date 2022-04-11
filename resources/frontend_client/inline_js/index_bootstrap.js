(function() {
  window.MetabaseBootstrap    = JSON.parse(document.getElementById("_metabaseBootstrap").textContent);
  window.MetabaseLocalization = JSON.parse(document.getElementById("_metabaseLocalization").textContent);

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
