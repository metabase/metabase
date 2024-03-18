import { useEmbeddingContext } from "metabase-embedding-sdk";
import { useEffect, useRef } from "react";

export const QuestionIFramePage = () => {
  const { sessionToken } = useEmbeddingContext();
  const iframeRef = useRef(null);

  const token = sessionToken?.token?.id;
  const questionId = "82";

  const iframeUrl = `http://localhost:3000/embed/sdk/question/${questionId}`;

  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.onload = () => {
        iframeRef.current.contentWindow.postMessage(
          {
            type: "metabase-token",
            token,
          },
          "*",
        );
      };
    }
  }, [token]);

  return (
    <div className="tw-h-screen tw-w-screen tw-overflow-scroll">
      token: {token}
      <br />
      <iframe
        ref={iframeRef}
        title="hello"
        src={iframeUrl}
        width="100%"
        height="100%"
        frameBorder="0"
        allowFullScreen
      />
    </div>
  );
};
