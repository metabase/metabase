/* @flow */
import React, {PropTypes} from "react";
import {Link} from "react-router";
import cx from "classnames";

/*
 * EmptyState is a component that can
 *   1) introduce a new section of Metabase to a user, and encourages the user to take an action
  *  2) indicate an empty result after an user-triggered search/query
 */


import Icon from "metabase/components/Icon.jsx";

type EmptyStateProps = {
    message: (string | React$Element<any>),
    title?: string,
    icon?: string,
    image?: string,
    imageClassName?: string,
    action?: string,
    link?: string,
    onActionClick?: () => void
}

const EmptyState = ({title, message, icon, image, imageClassName, action, link, onActionClick}: EmptyStateProps) =>
    <div className="text-centered text-brand-light my2">
        { title &&
        <h2 className="text-brand mb4">{title}</h2>
        }
        { icon &&
        <Icon name={icon} size={40}/>
        }
        { image &&
        <img src={`${image}.png`} height="250px" alt={message} srcSet={`${image}@2x.png 2x`} className={imageClassName}/>
        }
        <div className="flex justify-center">
            {
                (typeof message === 'string') ?
                    <h3 className="text-grey-2 mt4" style={{lineHeight: "1.5em"}}>{message}</h3>
                    : message
            }
            }
        </div>
        { action && link &&
        <Link to={link} className="Button Button--primary mt3"
              target={link.startsWith('http') ? "_blank" : ""}>{action}</Link>
        }
        { action && onActionClick &&
        <a onClick={onActionClick} className="Button Button--primary mt3">{action}</a>
        }
    </div>


export default EmptyState;
