/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import { parseDataUri } from "metabase/utils/data-url";
import { connect } from "metabase/utils/redux";
import {
  getIsDefaultMetabaseLogo,
  getLogoUrl,
} from "metabase-enterprise/settings/selectors";

const mapStateToProps = (state) => ({
  url: getLogoUrl(state),
  isDefaultMetabaseLogo: getIsDefaultMetabaseLogo(state),
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

  componentWillUnmount() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async loadImage(url) {
    if (this.abortController) {
      this.abortController.abort();
    }

    this._container.replaceChildren();

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
      this.abortController = new AbortController();
      try {
        const response = await fetch(url, {
          signal: this.abortController.signal,
        });

        if (!response.ok) {
          this.loadImageFallback(url);
          return;
        }

        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "image/svg+xml");
        const svg = doc.getElementsByTagName("svg")[0];

        if (svg) {
          svg.setAttribute("fill", "currentcolor");
          this.updateSize(svg);

          this._container.replaceChildren();
          this._container.appendChild(svg);
        } else {
          this.loadImageFallback(url);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          this.loadImageFallback(url);
        }
      }
    }
  }

  loadImageFallback(url) {
    this._container.replaceChildren();

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
    const {
      dark,
      style = {},
      height,
      className,
      isDefaultMetabaseLogo,
    } = this.props;

    return (
      <span
        ref={(c) => (this._container = c)}
        className={cx(
          "Icon",
          CS.textCentered,
          // If using the Metabase logo, use the non-whitelabeled Metabase brand color.
          {
            [isDefaultMetabaseLogo ? CS.textMetabaseBrand : CS.textBrand]:
              !dark,
          },
          { [CS.textWhite]: dark },
          className,
        )}
        style={{
          ...style,
          height: style.height || height || "32px",
        }}
        data-testid="main-logo"
      />
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(LogoIcon);
