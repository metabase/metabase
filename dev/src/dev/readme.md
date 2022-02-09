## Render png

Has some helper functions to help out with rendering debugging.

In this namespace, you can run `(help)` to get a bit of help. It's principle usage right now is to render and debug the svg images.

### NOTE!

You must build the js bundle used to create the svgs with visx. Run `yarn build-static-viz` to ensure that this bundle is created and the file `resources/frontend_client/app/dist/lib-static-viz.bundle.js` exists

Example usage below:

```clojure
dev=> (require 'dev.render-png)
nil
dev=> (in-ns 'dev.render-png)
#object[clojure.lang.Namespace 0x14fef810 "dev.render-png"]
dev.render-png=> (help)

To render some html, call the function `preview-html`. This takes one argument, a map.
The keys in the map are `:chart` and either `:html-file` or `:html-inline`.
(preview-html {:chart :donut :html-inline some-html-to-render})
or
(preview-html {:chart :donut :html-file some-file-with-html})

This function will render the html and open an image.
Valid charts are `:donut`, `:line`, and `:bar`.

You can use {{chart}} in your html to indicate where the image of the chart should be embedded.
It will be <img src=data-uri-of-chart style="display: block; width: 100%">

nil
dev.render-png=> (preview-html {:chart :donut :html-file "chart.html"})
nil
dev.render-png=>
```

The steps were
1. require the namespace, so the code is loaded
2. `in-ns` to go "in" the namespace so we can easily call the functions
3. call the function we care about. It will open up an image preview.

An example chart.html is

```html
<div>
  <h1>behold the donut</h1>
  {{chart}}
  <hr>
  <h3>the donut has been beholden</h3>
</div>
```

This file should be saved at the root of the repository for the call to `preview-html` to find it.
