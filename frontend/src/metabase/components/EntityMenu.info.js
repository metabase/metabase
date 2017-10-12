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
                    { title: "Edit this question", icon: "pencil", action: () => alert('Action type') },
                    { title: "View revision history", icon: "history", link: '/derp' },
                    { title: "Move", icon: "move", action: () => alert('Another action type') },
                    { title: "Archive", icon: "archive" }
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
                    { title: "Sharing and embedding", icon: "embedding", action: () => alert('Another action type') },
                ]}
            />
        </DemoAlignRight>
    ),
    'More menu': (
        <DemoAlignRight>
            <EntityMenu
                triggerIcon='grabber'
                items={[
                    { title: "Add to dashboard", icon: "add", action: () => alert('Action type') },
                    { title: "Download results", icon: "download", link: '/download' },
                    { title: "Sharing and embedding", icon: "embedding", action: () => alert('Another action type') },
                ]}
            />
        </DemoAlignRight>
    ),
    'Multiple menus': (
        <DemoAlignRight>
            <EntityMenu
                triggerIcon='pencil'
                items={[
                    { title: "Edit this question", icon: "pencil", action: () => alert('Action type') },
                    { title: "View revision history", icon: "history", link: '/derp' },
                    { title: "Move", icon: "move", action: () => alert('Another action type') },
                    { title: "Archive", icon: "archive" }
                ]}
            />
            <EntityMenu
                triggerIcon='share'
                items={[
                    { title: "Edit this question", icon: "pencil", action: () => alert('Action type') },
                    { title: "View revision history", icon: "history", link: '/derp' },
                    { title: "Move", icon: "move", action: () => alert('Another action type') },
                    { title: "Archive", icon: "archive" }
                ]}
            />
            <EntityMenu
                triggerIcon='grabber'
                items={[
                    { title: "Add to dashboard", icon: "add", action: () => alert('Action type') },
                    { title: "Download results", icon: "download", link: '/download' },
                    { title: "Sharing and embedding", icon: "embedding", action: () => alert('Another action type') },
                ]}
            />
        </DemoAlignRight>
    )
}
