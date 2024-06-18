/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";

import CS from "metabase/css/core/index.css";
import { removeAllChildren, parseDataUri } from "metabase/lib/dom";
import { getLogoUrl } from "metabase-enterprise/settings/selectors";

const mapStateToProps = state => ({
  url: getLogoUrl(state),
});

class LogoIcon extends Component {
  state = {
    svg: null,
  };

  static defaultProps = {
    height: 32,
  };

  static propTypes = {
    size: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
    dark: PropTypes.bool,
    className: PropTypes.string,
    style: PropTypes.object,
  };

  componentDidMount() {
    if (this.props.url) {
      this.loadImage(this.props.url);
    }
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    if (newProps.url && newProps.url !== this.props.url) {
      this.loadImage(newProps.url);
    }
  }

  loadImage(url) {
    if (this.xhr) {
      this.xhr.abort();
      this.xhr = null;
    }

    removeAllChildren(this._container);

    const parsed = parseDataUri(url);
    if (parsed) {
      if (parsed.mimeType === "image/svg+xml") {
        this._container.innerHTML = parsed.data;
        const svg = this._container.getElementsByTagName("svg")[0];
        if (svg) {
          svg.setAttribute("fill", "currentcolor");
          this.updateSize(svg);
        } else {
          this.loadImageFallback(url);
        }
      } else {
        this.loadImageFallback(url);
      }
    } else {
      const xhr = (this.xhr = new XMLHttpRequest());
      xhr.open("GET", url);
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          return;
        }
        const svg =
          xhr.responseXML && xhr.responseXML.getElementsByTagName("svg")[0];
        if (svg) {
          svg.setAttribute("fill", "currentcolor");
          this.updateSize(svg);

          removeAllChildren(this._container);
          this._container.appendChild(svg);
        } else {
          this.loadImageFallback(url);
        }
      };
      xhr.onerror = () => {
        this.loadImageFallback(url);
      };
      xhr.send();
    }
  }

  loadImageFallback(url) {
    removeAllChildren(this._container);

    const img = document.createElement("img");
    img.src = url;
    this.updateSize(img);

    this._container.appendChild(img);
  }

  updateSize(element) {
    const width = this.props.width || this.props.size;
    const height = this.props.height || this.props.size;
    if (width) {
      element.setAttribute("width", width);
    } else {
      element.removeAttribute("width");
    }
    if (height) {
      element.setAttribute("height", height);
    } else {
      element.removeAttribute("height");
    }
    element.style.maxWidth = "100%";
    element.style.maxHeight = "32px";
    element.style.minHeight = "100%";
    element.style.height = "auto";
  }

  render() {
    const { dark, style = {}, className } = this.props;
    style.height ||= "32px";
    return (
      <span
        ref={c => (this._container = c)}
        className={cx(
          "Icon",
          CS.textCentered,
          { [CS.textBrand]: !dark },
          { [CS.textWhite]: dark },
          className,
        )}
        style={style}
        data-testid="main-logo"
      />
    );
  }
}

export default connect(mapStateToProps)(LogoIcon);
