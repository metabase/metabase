// [<snippet example>]
"use client";

import dynamic from "next/dynamic";

import type React from "react";

// Lazy load the EmbeddingSdkProvider so and let it render children while it's being loaded
export const EmbeddingSdkProviderLazy = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const EmbeddingSdkProvider = dynamic(
    () =>
      import("./EmbeddingSdkProvider").then(m => {
        return { default: m.EmbeddingSdkProvider };
      }),
    {
      ssr: false,
      loading: () => {
        // render children while loading
        return <div>{children}</div>;
      },
    },
  );

  return <EmbeddingSdkProvider>{children}</EmbeddingSdkProvider>;
};

// Wrap all components that you need like this:

export const StaticQuestion = dynamic(
  () => import("@metabase/embedding-sdk-react").then(m => m.StaticQuestion),
  {
    ssr: false,
    loading: () => {
      return <div>Loading...</div>;
    },
  },
);

export const StaticDashboard = dynamic(
  () => import("@metabase/embedding-sdk-react").then(m => m.StaticDashboard),
  {
    ssr: false,
    loading: () => {
      return <div>Loading...</div>;
    },
  },
);
// [<endsnippet example>]
