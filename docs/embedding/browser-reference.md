---
title: Browser component reference
summary: "Reference for the metabase-browser web component attributes and the CollectionBrowser SDK props."
---

# Browser component reference

Reference material for embedding a collection browser:

- [Web component attributes](#web-component-metabase-browser-attributes)
- [React SDK props](#react-sdk-collectionbrowser-props)

For how to set all this up, check out [Embed a collection browser](./browser.md).

## Web component `metabase-browser` attributes

These attributes apply to the `<metabase-browser>` web component.

{% include_file "{{ dirname }}/eajs/snippets/MetabaseBrowserAttributes.md" snippet="properties" %}

Depending on the framework you're using, you may need to stringify attributes before passing them to the component. And if you surround an attribute's value with double quotes, use single quotes inside it:

```html
<metabase-browser
  initial-collection="Mn4OpQrStUvWxYzAbCdEf"
  collection-entity-types="['collection', 'dashboard']"
  data-picker-entity-types="['model']"
></metabase-browser>
```

The IDs in these examples are [entity IDs](../installation-and-operation/serialization.md#entity-ids-work-with-embedding). Sequential IDs work too, but entity IDs stay the same when you move content between instances, like from staging to production.

## React SDK `CollectionBrowser` props

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`CollectionBrowser` lists the items in a collection and reports clicks. Unlike the web component, it doesn't open items or offer buttons for creating them. See [React SDK collection browser](./browser.md#react-sdk-collection-browser).

- [Component](./sdk/api/CollectionBrowser.html)
- [Props](./sdk/api/CollectionBrowserProps.html)

{% include_file "{{ dirname }}/sdk/api/snippets/CollectionBrowserProps.md" snippet="properties" %}

## Further reading

- [Embed a collection browser](./browser.md)
- [Dashboard component reference](./dashboard-reference.md)
- [Question component reference](./question-reference.md)
- [Modular embedding components](./components.md)
