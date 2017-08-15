import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import NewQuery from "metabase/new_query/containers/NewQuery";

@connect(null, { onChangeLocation: push })
export class NewQuestionStart extends Component {
    render() {
        return <NewQuery onComplete={(query) => this.props.onChangeLocation(query.question().getUrl())} />
    }
}

