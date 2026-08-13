---
title: Browser component reference
summary: "Reference for the metabase-browser web component attributes and the CollectionBrowser SDK props."
---

# Browser component reference

Reference material for embedding a collection browser:

- [Web component attributes](#web-components-metabase-browser-attributes)
- [React SDK props](#react-sdk-collectionbrowser-props)

For how to set all this up, check out [Embed a collection browser](./browser.md).

## Web components `metabase-browser` attributes

These attributes apply to the `<metabase-browser>` web component.
{% include_file "{{ dirname }}/eajs/snippets/MetabaseBrowserAttributes.md" snippet="properties" %}

## React SDK `CollectionBrowser` props

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`CollectionBrowser` lists the items in a collection and reports clicks. Unlike the web component, it doesn't open items or offer buttons for creating them. See [Embed a collection browser with the React SDK](./browser.md#embed-a-collection-browser-with-the-react-sdk).

- [Component](./sdk/api/CollectionBrowser.html)
- [Props](./sdk/api/CollectionBrowserProps.html)

{% include_file "{{ dirname }}/sdk/api/snippets/CollectionBrowserProps.md" snippet="properties" %}

## Further reading

- [Embed a collection browser](./browser.md)
- [Dashboard component reference](./dashboard-reference.md)
- [Question component reference](./question-reference.md)
- [Modular embedding components](./components.md)
