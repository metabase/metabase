import { useEmbeddingContext } from "metabase-embedding-sdk";
import {useEffect, useRef} from "react";

export const QuestionIFramePage = ({
  config = {
    metabaseInstanceUrl: "http://localhost:3000",
    font: "Inter",
    authType: "jwt",
    jwtProviderUri: "http://localhost:8081/sso/metabase",
  },
}) => {
  const { sessionToken } = useEmbeddingContext();
  const iframeRef = useRef(null);

  const token = sessionToken?.token?.id;
  const questionId = "82";

  const iframeUrl = `http://localhost:3000/embed/sdk/question/${questionId}`;


  const sendMessageToIframe = message => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow.postMessage(message, "*");
    }
  };

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.onload = () => {
        sendMessageToIframe({
          type: "exampleMessage",
          data: { token },
        });
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
