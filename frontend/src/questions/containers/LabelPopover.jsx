import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import LabelPopoverContent from "../components/LabelPopoverContent.jsx";

import { setLabeled } from "../questions";
import { getLabels } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
      labels: getLabels(state)
  }
}

const mapDispatchToProps = {
    setLabeled
}

@connect(mapStateToProps, mapDispatchToProps)
export default class LabelPopover extends Component {
    render() {
        const { triggerElement, labels, setLabeled, item, count } = this.props;
        return (
            <PopoverWithTrigger
                triggerElement={triggerElement}
            >
                { () =>
                    <LabelPopoverContent labels={labels} setLabeled={setLabeled} item={item} count={count} />
                }
            </PopoverWithTrigger>
        );
    }
}
