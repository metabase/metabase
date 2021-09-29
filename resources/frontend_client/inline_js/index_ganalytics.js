(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

// if we are not doing tracking then go ahead and disable GA now so we never even track the initial pageview
const tracking = window.MetabaseBootstrap["anon-tracking-enabled"];
const ga_code = window.MetabaseBootstrap["ga-code"];
if (!tracking) {
  window['ga-disable-'+ga_code] = true;
}

ga('create', ga_code, 'auto');
