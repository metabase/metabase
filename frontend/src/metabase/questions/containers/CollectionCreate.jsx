import React, { Component, PropTypes } from "react";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import CollectionEditorForm from "./CollectionEditorForm.jsx";

import { saveCollection } from "../collections";

const mapStateToProps = (state, props) => {
    return {
        error: (state) => state.collections.error
    }
}

const mapDispatchToProps = {
    onSubmit: saveCollection,
    onClose: () => push("/questions")
}

export default connect(mapStateToProps, mapDispatchToProps)(CollectionEditorForm);
