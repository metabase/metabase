(function () {
  window.Metabase = window.Metabase || {};
  window.Metabase.AssetErrorLoad = function (tag) {
    console.error(
      `Could not download asset ${tag.src} from your metabase instance. \
This shouldn't happen normally, but can happen in certain \
instances where your browser has cached the index.html page, or \
there are different versions of metabase behind the same load balancer. \
If clearing your cache doesn't resolve the issue, please ensure \
all of your deployed instances of metabase are on the same version.`,
    );
  };
})();
