import React from "react";

import { Container, UrlContainer, TextArea, Select } from "./UrlInput.styled";

type Props = {
  protocol: string;
  setProtocol: (protocol: string) => void;
  url: string;
  setUrl: (url: string) => void;
};

const UrlInput: React.FC<Props> = ({
  protocol,
  setProtocol,
  url,
  setUrl,
}: Props) => {
  return (
    <div>
      <Container>
        <UrlContainer>
          <TextArea
            name="url"
            id="url"
            rows={2}
            wrap="soft"
            placeholder="example.com/api/v1/prices"
            value={url}
            onChange={event => setUrl(event.target.value)}
            onKeyDown={event => {
              if (event.keyCode === 13 || event.key === "Enter") {
                // prevent default behavior
                event.preventDefault();
              }
            }}
          />
        </UrlContainer>
        <div>
          <Select
            value={protocol}
            options={[
              { value: "http", name: "HTTP" },
              { value: "https", name: "HTTPS" },
            ]}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setProtocol(e.target.value)
            }
          />
        </div>
      </Container>
    </div>
  );
};

export default UrlInput;
