import React, { Component, PropTypes } from "react";
import S from "./Questions.css";

import QuestionsSidebar from "../components/QuestionsSidebar.jsx";
import QuestionsList from "../components/QuestionsList.jsx";
import SidebarLayout from "../components/SidebarLayout.jsx";

import cx from "classnames";

const Questions = (props) =>
    <SidebarLayout
        className={cx("spread", S.questions)}
        sidebar={<QuestionsSidebar {...props} />}
        content={<QuestionsList {...props} />}
    />

export default Questions;
