---
title: Embedded analytics SDK - plugins
---

# Embedded analytics SDK - plugins

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

The Metabase Embedded analytics SDK supports plugins to customize the behavior of components. These plugins can be used in a global context or on a per-component basis.

## Global plugins

To use a plugin globally, add the plugin to the `MetabaseProvider`'s `pluginsConfig` prop:

```typescript
{% include_file "{{ dirname }}/snippets/plugins/global-plugins.tsx" snippet="example" %}
```

## Component plugins

To use a plugin on a per-component basis, pass the plugin as a prop to the component:

```typescript
{% include_file "{{ dirname }}/snippets/plugins/component-plugins.tsx" snippet="example" %}
```

## `handleLink`

To customize what happens when people click a link in your embedded questions and dashboards, use the global plugin `handleLink`:

```typescript
export default function App() {
  const navigate = useNavigate(); // coming from whatever routing lib you're using

  const plugins = {
    handleLink: (urlString: string) => {
      const url = new URL(urlString, window.location.origin);
      const isInternal = url.origin === window.location.origin;
      if (isInternal) {
        // client side navigation
        navigate(url.pathname + url.search + url.hash);

        return { handled: true }; // prevent default navigation
      }
      return { handled: false }; // let the sdk do the default behavior
    },
  };

  return (
    <MetabaseProvider authConfig={authConfig} pluginsConfig={plugins}>
      <nav style={{ display: "flex", gap: 12, padding: 12 }}>
        <Link to="/">Home</Link>
        <Link to="/question">Question</Link>
        <Link to="/about">About</Link>
      </nav>
      <div style={{ padding: 12 }}>
        <Outlet />
      </div>
    </MetabaseProvider>
  );
}
```

## Further reading

- [Interactive question plugins](./questions.md#interactive-question-plugins)
- [Dashboard plugins](./dashboards.md#dashboard-plugins)
