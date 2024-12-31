/* eslint-disable react/prop-types */
import React, { useState } from "react";
import PropTypes from "prop-types";
import { Box, Flex } from "grid-styled";
import querystring from "querystring";

import { color } from "metabase/lib/colors";
import { extractQueryParams } from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";

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

const DownloadButton = ({
  children,
  method,
  url,
  params,
  extensions,
  ...props
}) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e) => {
    if (window.OSX) {
      // prevent form from being submitted normally
      e.preventDefault();
      // download using the API provided by the OS X app
      window.OSX.download(method, url, params, extensions);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (params) {
      const qs = querystring.stringify(params);
      downloadUrl += `?${qs}`;
    }

    try {
      const response = await fetch(downloadUrl, { raw: true });
      const blob = new Blob([response], { type: response.headers.get('content-type') });
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'shipx_analytics.csv';

      if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
          var filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
          var matches = filenameRegex.exec(contentDisposition);
          if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
          }
      }

      const downloadLink = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadLink;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadLink);
    } catch (error) {
      console.error('There was a problem with the fetch operation:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <form method={method} action={url} onSubmit={handleSubmit}>
        {params && extractQueryParams(params).map(getInput)}
        {!loading && (
          <Flex
            is="button"
            className="text-white-hover bg-brand-hover rounded cursor-pointer full hover-parent hover--inherit"
            align="center"
            p={1}
            my={1}
            onClick={handleClick}
            {...props}
          >
            <Icon
              name={children}
              size={32}
              mr={1}
              color={colorForType(children)}
            />
            <Label my={0}>.{children}</Label>
          </Flex>
        )}
        {loading && <div>Loading data, please wait!</div>}
      </form>
    </Box>
  );
};

const getInput = ([name, value]) => (
  <input type="hidden" name={name} value={value} />
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
