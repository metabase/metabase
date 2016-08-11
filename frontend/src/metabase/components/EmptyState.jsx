import React, { PropTypes } from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon.jsx";

const EmptyState = ({ title, message, icon, image, action, link }) =>
    <div className="text-centered text-brand-light">
        { title &&
            <h2 className="text-brand mb4">{title}</h2>
        }
        { icon &&
            <Icon name={icon} size={40} />
        }
        { image &&
            <img src={`${image}.png`} height="250px" alt={message} srcSet={`${image}@2x.png 2x`} />
        }
        <div className="flex justify-center">
            <h3 className="text-grey-2 mt4" style={{maxWidth: "375px"}}>{message}</h3>
        </div>
        { action &&
            <Link to={link} className="Button Button--primary mt3" target={link.startsWith('http') ? "_blank" : ""}>{action}</Link>
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
