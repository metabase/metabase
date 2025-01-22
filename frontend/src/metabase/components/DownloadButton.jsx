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
    let downloadUrl = url;
    let requestOptions = { method: "GET" }; // Default request options

    try {
      if (downloadUrl.includes("/api/card") && params) {
        // If URL contains /api/card, use POST and append data in FormData
        const formData = new FormData();
        Object.entries(params).forEach(([key, value]) => {
          formData.append(key, value);
        });

        requestOptions = {
          method: "POST",
          body: formData,
        };
      } else if (params) {
        // If not /api/card, use query parameters for GET request
        const qs = querystring.stringify(params);
        downloadUrl += `?${qs}`;
      }

      const response = await fetch(downloadUrl, requestOptions);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read the CSV data as text
      const csvText = await response.text();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'shipx_analytics.csv';

      if (contentDisposition && contentDisposition.includes('attachment')) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(contentDisposition);
        if (matches && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      // Create a Blob with the CSV text
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });

      // Generate a download link
      const downloadLink = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadLink;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(downloadLink);
      document.body.removeChild(a);
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
