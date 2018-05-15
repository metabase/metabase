import React from "react";
import PropTypes from "prop-types";

import Button from "metabase/components/Button.jsx";

const DownloadButton = ({
  className,
  style,
  children,
  method,
  url,
  params,
  extensions,
  ...props
}) => (
  <form className={className} style={style} method={method} action={url}>
    {params && Object.entries(params).flatMap(getInputs)}
    <Button
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
      {children}
    </Button>
  </form>
);

const getInputs = ([name, value]) => {
  if (value instanceof Array) return value.map(p => getInput(name, p));

  return [getInput(name, value)];
};

const getInput = (name, value) => (
  <input type="hidden" name={name} value={value} />
);

DownloadButton.propTypes = {
  className: PropTypes.string,
  style: PropTypes.object,
  url: PropTypes.string.isRequired,
  method: PropTypes.string,
  params: PropTypes.object,
  icon: PropTypes.string,
  extensions: PropTypes.array,
};

DownloadButton.defaultProps = {
  icon: "downarrow",
  method: "POST",
  params: {},
  extensions: [],
};

export default DownloadButton;
