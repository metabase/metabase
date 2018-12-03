//
//  AppDelegate.m
//  Metabase
//
//  Created by Cam Saul on 9/21/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import <Sparkle/Sparkle.h>

#import "AppDelegate.h"
#import "MainViewController.h"
#import "MetabaseTask.h"
#import "TaskHealthChecker.h"


@interface AppDelegate ()

@property (weak) IBOutlet NSWindow *window;

@property (strong, nonatomic) MetabaseTask *task;
@property (strong, nonatomic) TaskHealthChecker *healthChecker;

@end


static AppDelegate *sInstance = nil;


@implementation AppDelegate

+ (AppDelegate *)instance {
	return sInstance;
}

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
	sInstance = self;
	
	[[SUUpdater sharedUpdater] checkForUpdatesInBackground];
	
    [self startMetabaseTask];
	[self.healthChecker start];
}

- (void)applicationDidBecomeActive:(NSNotification *)notification {
	// re-start the health checker if it's not checking like it should be : the HEALTH CHECKER HEALTH CHECKER
    [self.healthChecker start];
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    [self stopMetabaseTask];
}


#pragma mark - Static Methods

- (void)startMetabaseTask {
    self.task = [MetabaseTask task];
    self.healthChecker.port = self.task.port;
}

- (void)stopMetabaseTask {
    [self.task disableTerminationAlert];
    self.task = nil;
}


#pragma mark - Getters / Setters

- (TaskHealthChecker *)healthChecker {
	if (!_healthChecker) {
		_healthChecker = [[TaskHealthChecker alloc] init];
	}
	return _healthChecker;
}

- (void)setTask:(MetabaseTask *)task {
	[_task terminate];
	_task = task;
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        [task launch];
    });
}

- (NSUInteger)port {
	return self.task.port;
}

@end
