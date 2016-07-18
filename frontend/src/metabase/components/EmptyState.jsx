import React, { PropTypes } from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon.jsx";

import S from "./EmptyState.css"

const EmptyState = ({ title, message, icon, image, action, link }) =>
    <div className={S.emptyState}>
        { title &&
            <h2 className={S.emptyStateTitle}>{title}</h2>
        }
        { icon &&
            <Icon name={icon} width={40} height={40} />
        }
        { image &&
            <img src={`${image}.png`} height="300px" alt={message} srcSet={`${image}@2x.png 2x`} />
        }
        <h3 className={S.emptyStateMessage}>{message}</h3>
        { action &&
            <Link className="Button Button--primary Button--large mt2" to={link}>{action}</Link>
        }
    </div>

EmptyState.propTypes = {
    title:      PropTypes.string,
    message:    PropTypes.string.isRequired,
    icon:       PropTypes.string,
    image:      PropTypes.string,
    action:     PropTypes.string,
    link:       PropTypes.string,
};

export default EmptyState;
