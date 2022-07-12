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
            className="w-full min-h-0 py-0 pr-12 bg-transparent border-transparent resize-none focus:ring-transparent placeholder-text-light text-medium focus:text-dark focus:border-transparent pl-7 sm:text-sm"
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
            className="h-full py-0 pl-2 font-semibold text-gray-500 bg-transparent border-transparent focus:ring-transparent focus:border-transparent pr-7 sm:text-sm"
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
