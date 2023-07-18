/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";
import BodyComponent from "metabase/components/BodyComponent";
import { HeaderModalRoot } from "./HeaderModal.styled";

class HeaderModal extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      initialTop: "-100%",
    };
  }

  componentDidMount() {
    this.setState({ initialTop: 0 });
  }

  render() {
    const { className, height, title, onDone, onCancel, isOpen } = this.props;
    const { initialTop } = this.state;
    return (
      <HeaderModalRoot
        className={className}
        style={{
          height: height,
          transform: `translateY(${isOpen ? initialTop : "-100%"})`,
        }}
      >
        <h2 className="text-white pb2">{title}</h2>
        <div className="flex layout-centered">
          <button
            className="Button Button--borderless text-brand bg-white text-bold"
            onClick={onDone}
          >{t`Done`}</button>
          {onCancel && <span className="text-white mx1">{t`or`}</span>}
          {onCancel && (
            <a
              className="cursor-pointer text-white text-bold"
              onClick={onCancel}
            >{t`Cancel`}</a>
          )}
        </div>
      </HeaderModalRoot>
    );
  }
}

export default BodyComponent(HeaderModal);
