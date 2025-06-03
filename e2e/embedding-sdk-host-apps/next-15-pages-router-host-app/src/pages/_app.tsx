import type { AppProps } from "next/app";

import { AppProvider } from "@/components/app-provider";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div style={{ display: "flex" }}>
      <AppProvider>
        <Component {...pageProps} />
      </AppProvider>
    </div>
  );
}
