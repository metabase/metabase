/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";
import { Box, Flex } from "grid-styled";

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
}) => (
  <Box>
    <form method={method} action={url}>
      {params && extractQueryParams(params).map(getInput)}
      <Flex
        is="button"
        className="text-white-hover bg-brand-hover rounded cursor-pointer full hover-parent hover--inherit"
        align="center"
        p={1}
        my={1}
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
      </Flex>
    </form>
  </Box>
);

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
