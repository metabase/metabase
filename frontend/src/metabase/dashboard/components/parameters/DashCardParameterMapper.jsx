import React, { Component, PropTypes } from "react";

import DashCardCardParameterMapper from "../../containers/DashCardCardParameterMapper.jsx";

const DashCardParameterMapper = ({ dashcard }) =>
    <div className="flex-full flex layout-centered">
        {[dashcard.card].concat(dashcard.series || []).map(card =>
            <DashCardCardParameterMapper dashcard={dashcard} card={card} />
        )}
    </div>

export default DashCardParameterMapper;
