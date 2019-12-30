import React from "react";
import PropTypes from "prop-types";
import { Box, Flex } from "grid-styled";
import papaparse from "papaparse";
import querystring from "querystring";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { extractQueryParams } from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import Text from "metabase/components/Text";

function colorForType(type) {
  switch (type) {
    case "csv":
      return color("accent7");
    case "xlsx":
      return color("accent1");
    case "json":
      return color("bg-dark");
    case "clipboard":
      return color("accent3");
    default:
      return color("brand");
  }
}

const ClipBoardButton = ({ url, params, children, ...props }) => {
  return (
    <Box>
      <Flex
        is="button"
        className="text-white-hover bg-brand-hover rounded cursor-pointer full hover-parent hover--inherit"
        align="center"
        px={1}
        onClick={e => {
          e.preventDefault();
          fetch(
            `${url
              .split("/")
              .slice(0, -1)
              .join("/")}/tsv`,
            {
              method: "POST",
              mode: "cors",
              cache: "no-cache",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: querystring.encode(params),
            },
          )
            .then(r => r.text())
            .then(text => {
              const j = papaparse.parse(text);
              const r = papaparse.unparse(j, { delimiter: "\t" });
              navigator.clipboard
                .writeText(r)
                .then(() => window.alert(t`Result copied to clipboard.`));
            });
        }}
        {...props}
      >
        <Icon name={children} size={32} mr={1} color={colorForType(children)} />
        <Text className="text-bold">.{children}</Text>
      </Flex>
    </Box>
  );
};

const DownloadButton = ({
  children,
  method,
  url,
  params,
  extensions,
  ...props
}) => {
  if (children === "clipboard") {
    return (
      <ClipBoardButton
        children={children}
        method={method}
        url={url}
        params={params}
        extensions={extensions}
        {...props}
      />
    );
  }

  return (
    <Box>
      <form method={method} action={url}>
        {params && extractQueryParams(params).map(getInput)}
        <Flex
          is="button"
          className="text-white-hover bg-brand-hover rounded cursor-pointer full hover-parent hover--inherit"
          align="center"
          px={1}
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
          <Icon
            name={children}
            size={32}
            mr={1}
            color={colorForType(children)}
          />
          <Text className="text-bold">.{children}</Text>
        </Flex>
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
