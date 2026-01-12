import { useState } from "react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { useCurrentUser } from "embedding-sdk-package/hooks/public/use-current-user";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";

import { InteractiveQuestion } from "../InteractiveQuestion";
import { MetabaseProvider } from "../MetabaseProvider";

const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/Plugins/handleLink",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
  argTypes: {
    questionId: {
      control: { type: "number" },
      description: "Question ID with links to test handleLink plugin",
    },
  },
  args: {
    questionId: null,
  } as { questionId: number | null },
};

const QuestionNotice = () => {
  return (
    <div
      style={{
        padding: "20px",
        background: "#fff3cd",
        border: "1px solid #ffc107",
        marginBottom: "10px",
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>Setup Instructions:</strong>{" "}
        {
          "This story requires a question id of a question with links. You can use "
        }
        <a
          href="http://metabase.localhost:3000/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImxpYi90eXBlIjoibWJxbC9xdWVyeSIsInN0YWdlcyI6W3sic291cmNlLXRhYmxlIjozLCJsaWIvdHlwZSI6Im1icWwuc3RhZ2UvbWJxbCIsImV4cHJlc3Npb25zIjpbWyJjb25jYXQiLHsibGliL3V1aWQiOiJjZDRlNDM5Yy00OTYwLTRlOWMtOGFkMy1iODQ2Mjk1ZjVmOGYiLCJlZmZlY3RpdmUtdHlwZSI6InR5cGUvVGV4dCIsImxpYi9leHByZXNzaW9uLW5hbWUiOiJHb29nbGUgaXQifSwiaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS9zZWFyY2g_cT1FQU4lMjAiLFsiZmllbGQiLHsibGliL3V1aWQiOiI2ODkxODJkOS0zNGMzLTQ5NGYtODk4NC1lNmUxODNmNzlmZDAiLCJlZmZlY3RpdmUtdHlwZSI6InR5cGUvVGV4dCIsImJhc2UtdHlwZSI6InR5cGUvVGV4dCJ9LDE1XV0sWyJjb25jYXQiLHsibGliL3V1aWQiOiJhNzMzZjNkNS1mZmNkLTQyMGYtOTMwNy1kMDlhOGM0MjBlMjgiLCJsaWIvZXhwcmVzc2lvbi1uYW1lIjoiQmluZyBpdCJ9LCJodHRwczovL3d3dy5iaW5nLmNvbS9zZWFyY2g_cT1FQU4lMjAiLFsiZmllbGQiLHsiZWZmZWN0aXZlLXR5cGUiOiJ0eXBlL1RleHQiLCJsaWIvdXVpZCI6ImI3ZTc2MGY3LTI3ZTktNDZiZS04NGVhLWZhMDIwOTRlMzUzMCIsImJhc2UtdHlwZSI6InR5cGUvVGV4dCJ9LDE1XV1dfV0sImRhdGFiYXNlIjoxfSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9"
          target="_blank"
          rel="noopener noreferrer"
        >
          <strong>this question template</strong>
        </a>
        . Open it, save it to your Metabase instance, and then enter the
        question ID in the controls below.
      </p>
    </div>
  );
};

const AdminUserCheck = () => {
  const user = useCurrentUser();
  if (!(user as any)?.is_superuser) {
    return (
      <div
        style={{
          padding: "20px",
          background: "#fff3cd",
          border: "1px solid #ffc107",
          marginBottom: "10px",
        }}
      >
        {
          "The storybook user is not set as admin. You may not have the permission to access the question. Go to "
        }
        <a
          href="http://metabase.localhost:3000/admin/people"
          target="_blank"
          rel="noopener noreferrer"
        >
          http://metabase.localhost:3000/admin/people
        </a>
        {" and make "}
        <strong>admin@metabase.com</strong>
        {" an admin."}
      </div>
    );
  }
  return null;
};

export const Default = ({ questionId }: { questionId: number }) => {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  const handleLink = (url: string) => {
    setSelectedUrl(url);
    return { handled: true };
  };

  if (!questionId) {
    return <QuestionNotice />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {selectedUrl && (
        <div
          style={{
            padding: "20px",
            background: "#e8f5e9",
            border: "1px solid #4caf50",
          }}
        >
          <p>Selected URL: {selectedUrl}</p>
        </div>
      )}
      <MetabaseProvider authConfig={config} pluginsConfig={{ handleLink }}>
        <AdminUserCheck />

        <InteractiveQuestion questionId={questionId} />
      </MetabaseProvider>
    </div>
  );
};
