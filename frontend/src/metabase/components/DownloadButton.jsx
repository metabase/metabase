/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";

import { color } from "metabase/lib/colors";
import { extractQueryParams } from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";
import { FormButton } from "./DownloadButton.styled";

function colorForType(type) {
  switch (type) {
    case "csv":
      return color("accent7");
    case "xlsx":
      return color("accent1");
    case "json":
      return color("bg-dark");
    default:
      return color("brand");
  }
}

const handleSubmit = async (e, { method, url, setStatus }) => {
  e.preventDefault();

  setStatus(`pending`);
  // Closes the download popover
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

  const formData = new URLSearchParams(new FormData(e.target));

  const options = { method };
  if (method === `POST`) {
    options.body = formData;
  } else if (method === `GET`) {
    options.query = formData;
  }

  fetch(url, options)
    .then(async res => {
      const reader = res.body.getReader();
      const stream = new ReadableStream({
        start(controller) {
          return pump();
          function pump() {
            return reader.read().then(({ done, value }) => {
              // When no more data needs to be consumed, close the stream
              if (done) {
                controller.close();
                return;
              }
              // Enqueue the next data chunk into our target stream
              controller.enqueue(value);
              return pump();
            });
          }
        },
      });
      const streamResponse = new Response(stream);
      const blob = await streamResponse.blob();
      const url = URL.createObjectURL(blob);

      const fileName = res.headers
        .get("Content-Disposition")
        .split(`;`)[1]
        .split(`filename=`)[1]
        .replace(/\"/g, ``);

      // create a pseudo-link to trigger download
      const link = document.createElement(`a`);
      link.href = url;
      link.setAttribute(`download`, fileName);
      document.body.appendChild(link);
      link.click();

      setStatus(`resolved`);
    })
    .catch(() => setStatus(`rejected`));
};

const DownloadButton = ({
  children,
  method,
  url,
  params,
  extensions,
  setStatus = () => {},
  ...props
}) => (
  <div>
    <form onSubmit={e => handleSubmit(e, { method, url, setStatus })}>
      {params && extractQueryParams(params).map(getInput)}
      <FormButton
        className="text-white-hover bg-brand-hover rounded cursor-pointer full hover-parent hover--inherit"
        onClick={e => {
          if (window.OSX) {
            // prevent form from being submitted normally
            e.preventDefault();
            // download using the API provided by the OS X app
            window.OSX.download(method, url, params, extensions);
          }
        }}
        {...props}
      >
        <Icon name={children} size={32} mr={1} color={colorForType(children)} />
        <Label my={0}>.{children}</Label>
      </FormButton>
    </form>
  </div>
);

const getInput = ([name, value]) => (
  <input key={name} type="hidden" name={name} value={value} />
);

DownloadButton.propTypes = {
  url: PropTypes.string.isRequired,
  method: PropTypes.string,
  params: PropTypes.object,
  extensions: PropTypes.array,
};

DownloadButton.defaultProps = {
  method: "POST",
  params: {},
  extensions: [],
};

export default DownloadButton;
