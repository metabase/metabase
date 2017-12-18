import React from 'react'

import EntityMenu from 'metabase/components/EntityMenu'

export const component = EntityMenu

export const description = `
    A menu with varios entity related options grouped by context.
`

const DemoAlignRight = ({ children }) =>
    <div className="flex flex-full">
            <div className="flex align-center ml-auto">
                {children}
            </div>
        </div>

export const examples = {
    'Edit menu': (
        <DemoAlignRight>
            <EntityMenu
                triggerIcon='pencil'
                items={[
                    { title: "Edit this question", icon: "editdocument", action: () => alert('Action type') },
                    { title: "View revision history", icon: "history", link: '/derp' },
                    { title: "Move", icon: "move", action: () => alert('Move action') },
                    { title: "Archive", icon: "archive", action: () => alert('Archive action') }
                ]}
            />
        </DemoAlignRight>
    ),
    'Share menu': (
        <DemoAlignRight>
            <EntityMenu
                triggerIcon='share'
                items={[
                    { title: "Add to dashboard", icon: "addtodash", action: () => alert('Action type') },
                    { title: "Download results", icon: "download", link: '/download' },
                    { title: "Sharing and embedding", icon: "embed", action: () => alert('Another action type') },
                ]}
            />
        </DemoAlignRight>
    ),
    'More menu': (
        <DemoAlignRight>
            <EntityMenu
                triggerIcon='burger'
                items={[
                    { title: "Get alerts about this", icon: "alert", action: () => alert('Get alerts about this') },
                    { title: "View the SQL", icon: "sql", link: '/download' },
                ]}
            />
        </DemoAlignRight>
    ),
    'Multiple menus': (
        <DemoAlignRight>
            <EntityMenu
                triggerIcon='pencil'
                items={[
                    { title: "Edit this question", icon: "editdocument", action: () => alert('Action type') },
                    { title: "View revision history", icon: "history", link: '/derp' },
                    { title: "Move", icon: "move", action: () => alert('Move action') },
                    { title: "Archive", icon: "archive", action: () => alert('Archive action') }
                ]}
            />
            <EntityMenu
                triggerIcon='share'
                items={[
                    { title: "Add to dashboard", icon: "addtodash", action: () => alert('Action type') },
                    { title: "Download results", icon: "download", link: '/download' },
                    { title: "Sharing and embedding", icon: "embed", action: () => alert('Another action type') },
                ]}
            />
            <EntityMenu
                triggerIcon='burger'
                items={[
                    { title: "Get alerts about this", icon: "alert", action: () => alert('Get alerts about this') },
                    { title: "View the SQL", icon: "sql", link: '/download' },
                ]}
            />
        </DemoAlignRight>
    )
}
