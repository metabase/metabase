import {
  defineMetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;

export default function App() {
  // [<snippet example>]
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
  // [<endsnippet example>]
}
