(function(p,l,o,w,i,n,g){if(!p[i]){p.GlobalSnowplowNamespace=p.GlobalSnowplowNamespace||[]; p.GlobalSnowplowNamespace.push(i);p[i]=function(){(p[i].q=p[i].q||[]).push(arguments) };p[i].q=p[i].q||[];n=l.createElement(o);g=l.getElementsByTagName(o)[0];n.async=1; n.src=w;g.parentNode.insertBefore(n,g)}}(window,document,"script","/app/dist/sp.lite.js","snowplow"));

window.snowplow("newTracker", "sp", "https://sp.metabase.com", {
  appId: "metabase",
  platform: "web",
  cookieSameSite: "Lax",
  discoverRootDomain: true,
  post: true,
  contexts: {
    webPage: true,
  },
});
