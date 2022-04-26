# Managing people and groups

To start managing people, first go to the **Admin panel** by clicking on the **gear** icon in the bottom of the navigation sidebar and selecting **Admin settings**.

In the Admin panel, select the **People** tab from the menu bar at the top of the screen. You'll see a list of all the people in your organization.

![Admin menu](images/AdminBar.png)

## Managing people

### Creating accounts for your team

To add a new person, click **Add person** in the upper right corner. You’ll be prompted to enter their name and email address.

If you’ve already [configured Metabase to use email](02-setting-up-email.md), Metabase will send the new user an invite email. Otherwise, it’ll give you a temporary password that you’ll have to send to the person you’re inviting by hand.

### Deactivating an account

To deactivate someone's account, click on the three dots icon on the right of a person’s row and select **Deactivate** from the dropdown. Deactivating an account will mark it as inactive and prevent the user from logging in - but it _won’t_ delete that person's saved questions or dashboards.

![Remove a user](images/RemoveUser.png)

To reactivate a deactivated account, click the **Deactivated** radio button at the top of the people list to see the list of deactivated accounts. Click on the icon on the far right to reactivate that account, allowing them to log in to Metabase again.

### Editing an account

You can edit someone's name and email address by clicking the three dots icon and choosing **Edit Details**. Note: be careful when changing someone's email address, because _this will change the address they’ll use to log in to Metabase_.

### Resetting someone’s password

If you've already [configured your email settings](02-setting-up-email.md), people can reset their passwords using the "forgot password" link on the login screen. If you haven't yet configured your email settings, they will see a message telling them to ask an admin to reset their password for them.

To reset a password for someone, just click the three dots icon next to their account and choose **Reset Password**. If you haven’t [configured your email settings](02-setting-up-email.md) yet, you’ll be given a temporary password that you’ll have to share with that person. Otherwise, they’ll receive a password reset email.

### Unsubscribe from all subscriptions / alerts

This action will delete any dashboard subscriptions or alerts the person has created, and remove them as a recipient from any other subscriptions or alerts.

This action doesn't affect email distribution lists that are managed outside of Metabase.

## Groups

To determine [who has access to what](05-setting-permissions.md), you’ll need to

- Create one or more groups.
- Choose which level of access that group has to different databases, collections, and so on.
- Then add people to those groups.
- (Optional) promote people to [group managers](#group-manager).

To view and manage your groups, go to the **Admin Panel** > **People** tab, and then click on **Groups** from the side menu.

![Groups](images/groups.png)

### Special default groups

Every Metabase has two default groups: Administrators and All Users. These are special groups that can’t be removed.

#### Administrators

To make someone an admin of Metabase, you just need to add them to the Administrators group. Metabase admins can log into the Admin Panel and make changes there, and they always have unrestricted access to all data that you have in your Metabase instance. So be careful who you add to the Administrator group!

#### All users

The **All Users** group is another special one. Every Metabase user is always a member of this group, though they can also be a member of as many other groups as you want. We recommend using the All Users group as a way to set default access levels for new Metabase users. If you have [Google single sign-on](10-single-sign-on.md) enabled, new users who join that way will be automatically added to the All Users group.

It's important that your All Users group should never have _greater_ access for an item than a group for which you're trying to restrict access — otherwise the more permissive setting will win out. See [Setting permissions](05-setting-permissions.md).

### Managing groups

#### Creating a group and adding people to it

To create a group, go to **Admin settings** > **People** > **Groups**, and click the **Add a group** button. 

We recommend creating groups that correspond to the teams your company or organization has, such as Human Resources, Engineering, Finance, and so on. By default, newly created groups don’t have access to anything.

Click into a group and then click `Add members` to add people to that group. Click on the X on the right side of a group member to remove them from that group. You can also add or remove people from groups from the People list using the dropdown in the Groups column.

#### Removing a group

To remove a group, click the X icon to the right of a group in the list to remove it (remember, you can’t remove the special default groups).

#### Adding people to groups

Adding people to groups allows you to assign 

- [Data access](05-setting-permissions.md),
- [Collection permissions](06-collections.md),
- [Application permissions](application-permissions.md).

To add someone to one or more groups, just click the Groups dropdown and click the checkboxes next to the group(s) you want to add the person to. You can also add people from the group's page.

### Group managers

{% include plans-blockquote.html feature="Group managers" %}

**Group managers** can manage other people within their group.

Group managers can:

- Add or remove people from their group (that is, people who already have accounts in your Metabase).
- View all people in the **Admin settings** > **People** tab.
- Promote other people to group manager, or demote them from group manager to member.
- Rename their group.

Group managers are not admins, so their powers are limited. They cannot create new groups or invite new people to your Metabase.

#### Promoting/demoting group managers

To promote someone to become a group manager:

1. Click on the **Gear** icon at the bottom of the navigation sidebar.
2. Go to **Admin settings** > **People** > **Groups**.
3. Select the group you want the person to manage. If the person isn't already in the group, you'll need to add that person to the group.
4. Find the person you want to promote, hover over their member type, and click the up arrow to promote them to group manager. If you want to demote them, click on the down arrow.

### Grouping strategies

For guidance on which groups you should create for your Metabase, check out [Permissions strategies](https://www.metabase.com/learn/permissions/strategy).

## Further reading

- [Configure Single Sign-On](10-single-sign-on.md).
- [Permissions overview](05-setting-permissions.md)
- [Learn permissions](https://www.metabase.com/learn/permissions/)
