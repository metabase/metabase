import React, { Component } from "react";
import { t } from "c-3po";
import { Flex } from "grid-styled";

import fitViewPort from "metabase/hoc/FitViewPort";

import Icon from "metabase/components/Icon";

// TODO: port to ErrorMessage for more consistent style

@fitViewPort
export default class Unauthorized extends Component {
  render() {
    return (
      <Flex
        className={this.props.fitClassNames}
        flexDirection="column"
        align="center"
        justifyContent="center"
        color=""
      >
        <Icon name="key" size={100} />
        <h1 className="mt4">{t`Sorry, you don’t have permission to see that.`}</h1>
      </Flex>
    );
  }
}
