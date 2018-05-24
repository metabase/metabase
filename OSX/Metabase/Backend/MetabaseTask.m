//
//  MetabaseTask.m
//  Metabase
//
//  Created by Cam Saul on 10/9/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "MetabaseTask.h"

@interface MetabaseTask ()

@property (nonatomic) NSUInteger port;
@property (nonatomic, strong) NSMutableArray *lastMessages; ///< 10 most recently logged messages.

@end


@implementation MetabaseTask

+ (MetabaseTask *)task {
	return [[MetabaseTask alloc] init];
}


#pragma mark - Local Methods

- (void)readHandleDidRead:(NSString *)message {
	// skip calls to health endpoint
	if ([message rangeOfString:@"GET /api/health"].location != NSNotFound) return;

	// strip off the timestamp that comes back from the backend so we don't get double-timestamps when NSLog adds its own
	NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^[\\d-:,\\s]+(.*$)" options:NSRegularExpressionAnchorsMatchLines|NSRegularExpressionAllowCommentsAndWhitespace error:nil];
	message = [regex stringByReplacingMatchesInString:message options:0 range:NSMakeRange(0, message.length) withTemplate:@"$1"];
	
	// remove control codes used to color output
	regex = [NSRegularExpression regularExpressionWithPattern:@"\\[\\d+m" options:0 error:nil];
	message = [regex stringByReplacingMatchesInString:message options:0 range:NSMakeRange(0, message.length) withTemplate:@""];
	

    // add the message to the recently logged messages. If we now have more than 5 remove the oldest
    [self.lastMessages addObject:message];
    if (self.lastMessages.count > 10) [self.lastMessages removeObjectAtIndex:0];
    
    // log the message the normal way as well
	NSLog(@"%@", message);
}

- (void)deleteOldDBLockFilesIfNeeded {
	NSString *lockFile	= [DBPath() stringByAppendingString:@".lock.db"];
	NSString *traceFile = [DBPath() stringByAppendingString:@".trace.db"];
	
	for (NSString *file in @[lockFile, traceFile]) {
		if ([[NSFileManager defaultManager] fileExistsAtPath:file]) {
			NSLog(@"Deleting %@...", file);
			
			NSError *error = nil;
			[[NSFileManager defaultManager] removeItemAtPath:file error:&error];
			
			if (error) {
				NSLog(@"Error deleting %@: %@", file, error.localizedDescription);
			}
		}
	}
}

- (void)launch {
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{
		[self deleteOldDBLockFilesIfNeeded];
				
		NSLog(@"Starting MetabaseTask @ 0x%zx...", (size_t)self);
		
		self.task				= [[NSTask alloc] init];
		self.task.launchPath	= JREPath();
		self.task.environment	= @{@"MB_DB_FILE": DBPath(),
									@"MB_PLUGINS_DIR": PluginsDirPath(),
									@"MB_JETTY_PORT": @(self.port),
									@"MB_CLIENT": @"OSX"};
		self.task.arguments		= @[@"-Djava.awt.headless=true", // this prevents the extra java icon from popping up in the dock when running
                                    @"-client",                  // make sure we're running in -client mode, which has a faster lanuch time
                                    @"-Xverify:none",            // disable bytecode verification for faster launch speed, not really needed here since JAR is packaged as part of signed .app
									@"-jar", UberjarPath()];
				
		__weak MetabaseTask *weakSelf = self;
		self.task.terminationHandler = ^(NSTask *task){
			NSLog(@"\n\n!!!!! Task terminated with exit code %d !!!!!\n\n", task.terminationStatus);
            
			dispatch_async(dispatch_get_main_queue(), ^{
				if ([[NSAlert alertWithMessageText:@"Fatal Error"
                                     defaultButton:@"Restart"
                                   alternateButton:@"Quit"
                                       otherButton:nil
                         informativeTextWithFormat:@"The Metabase server terminated unexpectedly.\n\nMessages:\n%@", [weakSelf.lastMessages componentsJoinedByString:@""]] // components should already have newline at end
                     runModal] == NSAlertDefaultReturn) {
					[weakSelf launch];
				} else {
					exit(task.terminationStatus);
				}
			});
		};
												
		NSLog(@"Launching MetabaseTask\nMB_DB_FILE='%@'\nMB_PLUGINS_DIR='%@'\nMB_JETTY_PORT=%lu\n%@ -jar %@", DBPath(), PluginsDirPath(), self.port, JREPath(), UberjarPath());
		[self.task launch];
	});
}

- (void)terminate {
	[super terminate];
	_port = 0;
}

- (void)disableTerminationAlert {
    self.task.terminationHandler = nil;
}


#pragma mark - Getters / Setters

- (NSUInteger)port {
	if (!_port) {
		srand((unsigned)time(NULL));
		_port = (rand() % 1000) + 13000;
		NSLog(@"Using port %lu", _port);
	}
	return _port;
}
                        

- (NSMutableArray *)lastMessages {
    if (!_lastMessages) _lastMessages = [NSMutableArray array];
    return _lastMessages;
}

@end
