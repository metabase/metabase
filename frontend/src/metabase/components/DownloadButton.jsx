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
      return color("filter");
    case "xlsx":
      return color("summarize");
    case "json":
      return color("bg-dark");
    default:
      return color("brand");
  }
}

const retrieveFilename = ({ res, type }) => {
  const contentDispositionHeader = res.headers.get("Content-Disposition") || "";
  const contentDisposition = decodeURIComponent(contentDispositionHeader);
  const match = contentDisposition.match(/filename="(?<fileName>.+)"/);
  const fileName =
    match?.groups?.fileName ||
    `query_result_${new Date().toISOString()}.${type}`;

  return fileName;
};

const handleSubmit = async (
  e,
  {
    method,
    url,
    type,
    onDownloadStart,
    onDownloadResolved,
    onDownloadRejected,
  },
) => {
  e.preventDefault();

  onDownloadStart();

  const formData = new URLSearchParams(new FormData(e.target));

  const options = { method };
  if (method === `POST`) {
    options.body = formData;
  } else if (method === `GET`) {
    options.query = formData.toString();
  }

  fetch(method === `POST` ? url : url + "?" + options.query, options)
    .then(async res => {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // retrieves the filename from the response header and parses it into query_result[DATE TIME].extension
      const fileName = retrieveFilename({ res, type });

      // create a pseudo-link to trigger the download
      const link = document.createElement(`a`);
      link.href = url;
      link.setAttribute(`download`, fileName);
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(url);
      link.remove();

      onDownloadResolved();
    })
    .catch(() => onDownloadRejected());
};

const DownloadButton = ({
  children,
  method,
  url,
  params,
  extensions,
  onDownloadStart,
  onDownloadResolved,
  onDownloadRejected,
  ...props
}) => (
  <div>
    <form
      onSubmit={e =>
        handleSubmit(e, {
          method,
          url,
          type: children,
          onDownloadStart,
          onDownloadResolved,
          onDownloadRejected,
        })
      }
    >
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
  onDownloadStart: PropTypes.func,
  onDownloadResolved: PropTypes.func,
  onDownloadRejected: PropTypes.func,
};

DownloadButton.defaultProps = {
  method: "POST",
  params: {},
  extensions: [],
};

export default DownloadButton;
