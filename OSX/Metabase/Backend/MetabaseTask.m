//
//  MetabaseTask.m
//  Metabase
//
//  Created by Cam Saul on 10/9/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "MetabaseTask.h"

#define ENABLE_JAR_UNPACKING 0

@interface MetabaseTask ()

#if ENABLE_JAR_UNPACKING
	@property (strong, readonly) NSString *unpack200Path;
#endif

@property (nonatomic) NSUInteger port;
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
	
	NSLog(@"%@", message);
}

#if ENABLE_JAR_UNPACKING
/// unpack the jars in the BG if needed the first time around
- (void)unpackJars {
	[self.packedJarPaths enumerateObjectsWithOptions:NSEnumerationConcurrent usingBlock:^(NSString *packedFilename, NSUInteger idx, BOOL *stop) {
		NSString *jarName = [packedFilename stringByReplacingOccurrencesOfString:@".pack.gz" withString:@".jar"];
		
		if (![[NSFileManager defaultManager] fileExistsAtPath:jarName]) {
			NSLog(@"Unpacking %@ ->\n\t%@...", packedFilename, jarName);
			NSTask *task = [[NSTask alloc] init];
			task.launchPath = self.unpack200Path;
			task.arguments = @[packedFilename, jarName];
			[task launch];
			[task waitUntilExit];
		}
	}];
}
#endif

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
		
		#if ENABLE_JAR_UNPACKING
			[self unpackJars];
		#endif
		
		[self deleteOldDBLockFilesIfNeeded];
				
		NSLog(@"Starting MetabaseTask @ 0x%zx...", (size_t)self);
		
		self.task					= [[NSTask alloc] init];
		self.task.launchPath		= JREPath();
		self.task.environment		= @{@"MB_DB_FILE": DBPath(),
										@"MB_JETTY_PORT": @(self.port)};
		self.task.arguments			= @[@"-Djava.awt.headless=true",
										@"-jar", UberjarPath()];
				
		__weak MetabaseTask *weakSelf = self;
		self.task.terminationHandler = ^(NSTask *task){
			NSLog(@"\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Task terminated with exit code %d !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", task.terminationStatus);
			dispatch_async(dispatch_get_main_queue(), ^{
				if ([[NSAlert alertWithMessageText:@"Fatal Error" defaultButton:@"Restart" alternateButton:@"Quit" otherButton:nil informativeTextWithFormat:@"The Metabase server terminated unexpectedly."] runModal] == NSAlertDefaultReturn) {
					[weakSelf launch];
				} else {
					exit(task.terminationStatus);
				}
			});
		};
												
		NSLog(@"Launching MetabaseTask\nMB_DB_FILE='%@' MB_JETTY_PORT=%lu %@ -jar %@", DBPath(), self.port, JREPath(), UberjarPath());
		[self.task launch];
	});
}

- (void)terminate {
	[super terminate];
	_port = 0;
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

#if ENABLE_JAR_UNPACKING
- (NSArray *)packedJarPaths {
	return [[NSBundle mainBundle] pathsForResourcesOfType:@"pack.gz" inDirectory:@"jre/lib"];
}

- (NSString *)unpack200Path {
	return [[NSBundle mainBundle] pathForResource:@"unpack200" ofType:nil inDirectory:@"jre/bin"];
}
#endif

@end
