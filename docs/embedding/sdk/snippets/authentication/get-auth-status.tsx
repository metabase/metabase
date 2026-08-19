import {
  InteractiveQuestion,
  useMetabaseAuthStatus,
} from "@metabase/embedding-sdk-react";

const Example = () => {
  // [<snippet example>]
  const auth = useMetabaseAuthStatus();

  if (auth?.status === "error") {
    return <div>Failed to authenticate: {auth.error.message}</div>;
  }

  if (auth?.status === "success") {
    return <InteractiveQuestion questionId="Pq7RsTuVwXyZaBcDeFgHi" />;
  }
  // [<endsnippet example>]
};
