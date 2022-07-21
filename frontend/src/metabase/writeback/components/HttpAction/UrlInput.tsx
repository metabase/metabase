import React from "react";
import cx from "classnames";

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
            id="protocol"
            name="protocol"
            value={protocol}
            onChange={event => setProtocol(event.target.value)}
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
          </Select>
        </div>
      </Container>
    </div>
  );
};

export default UrlInput;
