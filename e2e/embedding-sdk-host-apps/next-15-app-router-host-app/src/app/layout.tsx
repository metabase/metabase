import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";

import { AppProvider } from "@/app/app-provider";

export const metadata: Metadata = {
  title: "Next 14 App Router Host App",
  description: "For testing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ display: "flex" }}>
        <Suspense>
          <AppProvider>{children}</AppProvider>
        </Suspense>
      </body>
    </html>
  );
}
