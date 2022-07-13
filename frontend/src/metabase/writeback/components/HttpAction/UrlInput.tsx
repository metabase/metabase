import React from "react";
import cx from "classnames";

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
      <label htmlFor="url" className="block sr-only">
        URL
      </label>
      <div className="flex items-start">
        <div className="flex-grow">
          <textarea
            name="url"
            id="url"
            rows={2}
            wrap="soft"
            className="w-full min-h-0 pr-12 bg-transparent border-transparent resize-none py0 placeholder-text-light text-medium focus:text-dark focus:border-transparent pl-7 sm:text-small"
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
        </div>
        <div className="">
          <label htmlFor="protocol" className="sr-only">
            Protocol
          </label>
          <select
            id="protocol"
            name="protocol"
            className="font-semibold bg-transparent border-transparent full-height py0 pl1 text-medium pr-7 sm:text-small"
            value={protocol}
            onChange={event => setProtocol(event.target.value)}
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default UrlInput;
