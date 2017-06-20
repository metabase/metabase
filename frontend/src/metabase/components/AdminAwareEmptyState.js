import React from "react";
/*
 * AdminAwareEmptyState is a component that can
 *  1) Produce a custom message for admins in empty results
 */

const AdminAwareEmptyState = ({user, title, message, adminMessage, icon, image, imageHeight, imageClassName, action, adminAction, link, adminLink, onActionClick, smallDescription = false}) =>
         <EmptyState 
            title={title}
            message={user.is_superuser ?
                adminMessage || message :
                message
            }
            icon={icon}
            image={image}
            action={user.is_superuser ?
                adminAction || action :
                action
            }
            link={user.is_superuser ?
                adminLink || link :
                link
            }
            imageHeight={imageHeight}
            imageClassName={imageClassName}
            onActionClick={onActionClick}
            smallDescription={smallDescription}
        />


export default AdminAwareEmptyState;