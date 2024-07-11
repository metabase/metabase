(function () {
  window.mbErrorAlert = false;
  window.AssetErrorLoad = function (tag) {
    console.error(
      `Could not download asset ${tag.src} from your metabase instance. 
This shouldn't happen normally, but can happen in certain 
instances where your browser has cached the index.html page, or 
there are different versions of metabase behind the same load balancer. 
If clearing your cache doesn't resolve the issue, please ensure your
all your deployed instances of metabase are on the same version.`,
    );

    if (!window.mbErrorAlert) {
      alert(
        "Failed to load an asset. Please clear your cache and refresh the page.",
      );
      window.mbErrorAlert = true;
    }
  };
})();
