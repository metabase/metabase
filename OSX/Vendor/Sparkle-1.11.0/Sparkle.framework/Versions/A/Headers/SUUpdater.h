//
//  SUUpdater.h
//  Sparkle
//
//  Created by Andy Matuschak on 1/4/06.
//  Copyright 2006 Andy Matuschak. All rights reserved.
//

#ifndef SUUPDATER_H
#define SUUPDATER_H

#import <Foundation/Foundation.h>
#import "SUExport.h"
#import "SUVersionComparisonProtocol.h"
#import "SUVersionDisplayProtocol.h"

@class SUUpdateDriver, SUAppcastItem, SUHost, SUAppcast;

@protocol SUUpdaterDelegate;

/*!
    The main API in Sparkle for controlling the update mechanism.

    This class is used to configure the update paramters as well as manually
    and automatically schedule and control checks for updates.
 */
SU_EXPORT @interface SUUpdater : NSObject

@property (unsafe_unretained) IBOutlet id<SUUpdaterDelegate> delegate;

+ (SUUpdater *)sharedUpdater;
+ (SUUpdater *)updaterForBundle:(NSBundle *)bundle;
- (instancetype)initForBundle:(NSBundle *)bundle;

@property (readonly, strong) NSBundle *hostBundle;
@property (strong, readonly) NSBundle *sparkleBundle;

@property BOOL automaticallyChecksForUpdates;

@property NSTimeInterval updateCheckInterval;

/*!
 * The URL of the appcast used to download update information.
 *
 * This property must be called on the main thread.
 */
@property (copy) NSURL *feedURL;

@property (nonatomic, copy) NSString *userAgentString;

@property (copy) NSDictionary *httpHeaders;

@property BOOL sendsSystemProfile;

@property BOOL automaticallyDownloadsUpdates;

/*!
    Explicitly checks for updates and displays a progress dialog while doing so.

    This method is meant for a main menu item.
    Connect any menu item to this action in Interface Builder,
    and Sparkle will check for updates and report back its findings verbosely
    when it is invoked.
 */
- (IBAction)checkForUpdates:(id)sender;

/*!
    Checks for updates, but does not display any UI unless an update is found.

    This is meant for programmatically initating a check for updates. That is,
    it will display no UI unless it actually finds an update, in which case it
    proceeds as usual.

    If the fully automated updating is turned on, however, this will invoke that
    behavior, and if an update is found, it will be downloaded and prepped for
    installation.
 */
- (void)checkForUpdatesInBackground;

/*!
    Returns the date of last update check.

    \returns \c nil if no check has been performed.
 */
@property (readonly, copy) NSDate *lastUpdateCheckDate;

/*!
    Begins a "probing" check for updates which will not actually offer to
    update to that version.

    However, the delegate methods
    SUUpdaterDelegate::updater:didFindValidUpdate: and
    SUUpdaterDelegate::updaterDidNotFindUpdate: will be called,
    so you can use that information in your UI.
 */
- (void)checkForUpdateInformation;

/*!
    Appropriately schedules or cancels the update checking timer according to
    the preferences for time interval and automatic checks.

    This call does not change the date of the next check,
    but only the internal NSTimer.
 */
- (void)resetUpdateCycle;

@property (readonly) BOOL updateInProgress;

@end

// -----------------------------------------------------------------------------
// SUUpdater Notifications for events that might be interesting to more than just the delegate
// The updater will be the notification object
// -----------------------------------------------------------------------------
SU_EXPORT extern NSString *const SUUpdaterDidFinishLoadingAppCastNotification;
SU_EXPORT extern NSString *const SUUpdaterDidFindValidUpdateNotification;
SU_EXPORT extern NSString *const SUUpdaterDidNotFindUpdateNotification;
SU_EXPORT extern NSString *const SUUpdaterWillRestartNotification;
#define SUUpdaterWillRelaunchApplicationNotification SUUpdaterWillRestartNotification;
#define SUUpdaterWillInstallUpdateNotification SUUpdaterWillRestartNotification;

// Key for the SUAppcastItem object in the SUUpdaterDidFindValidUpdateNotification userInfo
SU_EXPORT extern NSString *const SUUpdaterAppcastItemNotificationKey;
// Key for the SUAppcast object in the SUUpdaterDidFinishLoadingAppCastNotification userInfo
SU_EXPORT extern NSString *const SUUpdaterAppcastNotificationKey;

// -----------------------------------------------------------------------------
//	SUUpdater Delegate:
// -----------------------------------------------------------------------------

/*!
    Provides methods to control the behavior of an SUUpdater object.
 */
@protocol SUUpdaterDelegate <NSObject>
@optional

/*!
    Returns whether to allow Sparkle to pop up.

    For example, this may be used to prevent Sparkle from interrupting a setup assistant.

    \param updater The SUUpdater instance.
 */
- (BOOL)updaterMayCheckForUpdates:(SUUpdater *)updater;

/*!
    Returns additional parameters to append to the appcast URL's query string.

    This is potentially based on whether or not Sparkle will also be sending along the system profile.

    \param updater The SUUpdater instance.
    \param sendingProfile Whether the system profile will also be sent.

    \return An array of dictionaries with keys: "key", "value", "displayKey", "displayValue", the latter two being specifically for display to the user.
 */
- (NSArray *)feedParametersForUpdater:(SUUpdater *)updater sendingSystemProfile:(BOOL)sendingProfile;

/*!
    Returns a custom appcast URL.

    Override this to dynamically specify the entire URL.

    \param updater The SUUpdater instance.
 */
- (NSString *)feedURLStringForUpdater:(SUUpdater *)updater;

/*!
    Returns whether Sparkle should prompt the user about automatic update checks.

    Use this to override the default behavior.

    \param updater The SUUpdater instance.
 */
- (BOOL)updaterShouldPromptForPermissionToCheckForUpdates:(SUUpdater *)updater;

/*!
    Called after Sparkle has downloaded the appcast from the remote server.

    Implement this if you want to do some special handling with the appcast once it finishes loading.

    \param updater The SUUpdater instance.
    \param appcast The appcast that was downloaded from the remote server.
 */
- (void)updater:(SUUpdater *)updater didFinishLoadingAppcast:(SUAppcast *)appcast;

/*!
    Returns the item in the appcast corresponding to the update that should be installed.

    If you're using special logic or extensions in your appcast,
    implement this to use your own logic for finding a valid update, if any,
    in the given appcast.

    \param appcast The appcast that was downloaded from the remote server.
    \param updater The SUUpdater instance.
 */
- (SUAppcastItem *)bestValidUpdateInAppcast:(SUAppcast *)appcast forUpdater:(SUUpdater *)updater;

/*!
    Called when a valid update is found by the update driver.

    \param updater The SUUpdater instance.
    \param item The appcast item corresponding to the update that is proposed to be installed.
 */
- (void)updater:(SUUpdater *)updater didFindValidUpdate:(SUAppcastItem *)item;

/*!
    Called when a valid update is not found.

    \param updater The SUUpdater instance.
 */
- (void)updaterDidNotFindUpdate:(SUUpdater *)updater;

/*!
    Called immediately before downloading the specified update.

    \param updater The SUUpdater instance.
    \param item The appcast item corresponding to the update that is proposed to be downloaded.
    \param request The mutable URL request that will be used to download the update.
 */
- (void)updater:(SUUpdater *)updater willDownloadUpdate:(SUAppcastItem *)item withRequest:(NSMutableURLRequest *)request;

/*!
    Called after the specified update failed to download.

    \param updater The SUUpdater instance.
    \param item The appcast item corresponding to the update that failed to download.
    \param error The error generated by the failed download.
 */
- (void)updater:(SUUpdater *)updater failedToDownloadUpdate:(SUAppcastItem *)item error:(NSError *)error;

/*!
    Called immediately before installing the specified update.

    \param updater The SUUpdater instance.
    \param item The appcast item corresponding to the update that is proposed to be installed.
 */
- (void)updater:(SUUpdater *)updater willInstallUpdate:(SUAppcastItem *)item;

/*!
    Returns whether the relaunch should be delayed in order to perform other tasks.

    This is not called if the user didn't relaunch on the previous update,
    in that case it will immediately restart.

    \param updater The SUUpdater instance.
    \param item The appcast item corresponding to the update that is proposed to be installed.
    \param invocation The invocation that must be completed before continuing with the relaunch.

    \return \c YES to delay the relaunch until \p invocation is invoked.
 */
- (BOOL)updater:(SUUpdater *)updater shouldPostponeRelaunchForUpdate:(SUAppcastItem *)item untilInvoking:(NSInvocation *)invocation;

/*!
    Returns whether the application should be relaunched at all.

    Some apps \b cannot be relaunched under certain circumstances.
    This method can be used to explicitly prevent a relaunch.

    \param updater The SUUpdater instance.
 */
- (BOOL)updaterShouldRelaunchApplication:(SUUpdater *)updater;

/*!
    Called immediately before relaunching.

    \param updater The SUUpdater instance.
 */
- (void)updaterWillRelaunchApplication:(SUUpdater *)updater;

/*!
    Returns an object that compares version numbers to determine their arithmetic relation to each other.

    This method allows you to provide a custom version comparator.
    If you don't implement this method or return \c nil,
    the standard version comparator will be used.

    \sa SUStandardVersionComparator

    \param updater The SUUpdater instance.
 */
- (id<SUVersionComparison>)versionComparatorForUpdater:(SUUpdater *)updater;

/*!
    Returns an object that formats version numbers for display to the user.

    If you don't implement this method or return \c nil,
    the standard version formatter will be used.

    \sa SUUpdateAlert

    \param updater The SUUpdater instance.
 */
- (id<SUVersionDisplay>)versionDisplayerForUpdater:(SUUpdater *)updater;

/*!
    Returns the path which is used to relaunch the client after the update is installed.

    The default is the path of the host bundle.

    \param updater The SUUpdater instance.
 */
- (NSString *)pathToRelaunchForUpdater:(SUUpdater *)updater;

/*!
    Called before an updater shows a modal alert window,
    to give the host the opportunity to hide attached windows that may get in the way.

    \param updater The SUUpdater instance.
 */
- (void)updaterWillShowModalAlert:(SUUpdater *)updater;

/*!
    Called after an updater shows a modal alert window,
    to give the host the opportunity to hide attached windows that may get in the way.

    \param updater The SUUpdater instance.
 */
- (void)updaterDidShowModalAlert:(SUUpdater *)updater;

/*!
    Called when an update is scheduled to be silently installed on quit.

    \param updater The SUUpdater instance.
    \param item The appcast item corresponding to the update that is proposed to be installed.
    \param invocation Can be used to trigger an immediate silent install and relaunch.
 */
- (void)updater:(SUUpdater *)updater willInstallUpdateOnQuit:(SUAppcastItem *)item immediateInstallationInvocation:(NSInvocation *)invocation;

/*!
    Calls after an update that was scheduled to be silently installed on quit has been canceled.

    \param updater The SUUpdater instance.
    \param item The appcast item corresponding to the update that was proposed to be installed.
 */
- (void)updater:(SUUpdater *)updater didCancelInstallUpdateOnQuit:(SUAppcastItem *)item;

/*!
    Called after an update is aborted due to an error.

    \param updater The SUUpdater instance.
    \param error The error that caused the abort
 */
- (void)updater:(SUUpdater *)updater didAbortWithError:(NSError *)error;

@end

#endif
