# Injecting Shared Libraries into Android Child Processes

**Target:** Android games/apps that use split-process architecture (for
example, `com.game.app` and `com.game.app:UnityKillsMe`).

**Goal:** Load a shared library (`.so`) inside a specific child process.
This addresses cases where a conventional APK patch loads the library
only in the main process.

> **Scope and authorization:** Use this workflow only on apps and
> devices you own or are explicitly authorized to test. Instrumentation
> can violate an app's terms, expose sensitive data, or destabilize the
> app. Frida Gadget is an instrumentation component; use it only for
> legitimate debugging and security testing.

## Prerequisites

-   Decompiled APK, created with `apktool d <app>.apk`
-   Target shared library, such as `libfrida-gadget.so` or a custom
    `libdumper.so`
-   Code editor (VS Code, Notepad++, etc.)
-   Android SDK Build Tools, including `zipalign` and `apksigner`
-   `apktool` and (if generating a keystore) `keytool`
-   A test device or emulator with USB debugging enabled

## Step 1: Create the Smali loader

A `ContentProvider` is initialized during app startup, before
`Application.onCreate()` is called. Assigning the provider to a named
process allows its class to be initialized in that process.

1.  Open the decompiled APK directory.
2.  Locate the appropriate Smali source directory:
    -   `smali/` for the primary DEX, or
    -   `smali_classes2/`, `smali_classes3/`, etc. for additional DEX
        files.
3.  Create the directory `com/frida/` under the selected Smali root.
4.  Create `FridaLoader.smali` inside that directory.
5.  Add the following code:

``` smali
.class public Lcom/frida/FridaLoader;
.super Landroid/content/ContentProvider;
.source "FridaLoader.java"

# Static initialization: load the library when this class is initialized.
.method static constructor <clinit>()V
    .locals 1
    # Use the library name without the "lib" prefix or ".so" suffix.
    const-string v0, "frida-gadget"
    invoke-static {v0}, Ljava/lang/System;->loadLibrary(Ljava/lang/String;)V
    return-void
.end method

# ContentProvider boilerplate.
.method public constructor <init>()V
    .locals 0
    invoke-direct {p0}, Landroid/content/ContentProvider;-><init>()V
    return-void
.end method

.method public onCreate()Z
    .locals 1
    const/4 v0, 0x1
    return v0
.end method

.method public query(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;
    .locals 1
    const/4 v0, 0x0
    return-object v0
.end method

.method public getType(Landroid/net/Uri;)Ljava/lang/String;
    .locals 1
    const/4 v0, 0x0
    return-object v0
.end method

.method public insert(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;
    .locals 1
    const/4 v0, 0x0
    return-object v0
.end method

.method public delete(Landroid/net/Uri;Ljava/lang/String;[Ljava/lang/String;)I
    .locals 1
    const/4 v0, 0x0
    return v0
.end method

.method public update(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I
    .locals 1
    const/4 v0, 0x0
    return v0
.end method
```

**Important:** Replace `frida-gadget` with the library's actual name,
omitting the `lib` prefix and `.so` suffix. For example, `libdumper.so`
is loaded with `System.loadLibrary("dumper")`.

## Step 2: Register the provider in `AndroidManifest.xml`

1.  Open `AndroidManifest.xml` in the root of the decompiled APK.
2.  Find the `<application>` element.
3.  Add a provider declaration inside `<application>`:

``` xml
<application
    android:name="androidx.multidex.MultiDexApplication"
    ... >

    <provider
        android:name="com.frida.FridaLoader"
        android:authorities="com.frida.fridaloader"
        android:exported="false"
        android:process=":UnityKillsMe" />

    <!-- Keep the app's other existing components here. -->
</application>
```

### Manifest attributes

-   `android:name`: Must match the class path represented by the Smali
    class, `Lcom/frida/FridaLoader;`.
-   `android:authorities`: Must be unique within the device/package
    installation.
-   `android:exported="false"`: Keeps the provider unavailable to other
    apps.
-   `android:process=":UnityKillsMe"`: Assigns the provider to the app's
    `:UnityKillsMe` child process.

To target a different process, replace `:UnityKillsMe` with the process
name used by the app. To use the app's main process, omit
`android:process`.

**Verify the process name** rather than assuming it. It can be inspected
from device process listings or app logs. A manifest process name
beginning with `:` is a private process name relative to the app's
package.

## Step 3: Add the shared library

1.  Open the decompiled APK's native library directory, such as
    `lib/arm64-v8a/`.
2.  Copy the matching ABI build of the `.so` file into that directory.
3.  Confirm that the filename matches the name used by
    `System.loadLibrary()`:
    -   File: `libfrida-gadget.so`
    -   Smali argument: `frida-gadget`

The library must match the target device/process ABI. For example, an
`arm64-v8a` process needs a compatible 64-bit ARM library.

### Optional: Configure Frida Gadget

If using Frida Gadget, place its configuration file beside the Gadget
library using the filename expected by the Gadget version, commonly
`libfrida-gadget.config`.

Example configuration:

``` json
{
  "interaction": {
    "type": "listen",
    "address": "127.0.0.1",
    "port": 27043
  }
}
```

A separate port can avoid a collision if another process already has a
Gadget listening on the default port. Keep the listener bound to
loopback unless remote access is specifically required and secured.

## Step 4: Rebuild, align, and sign the APK

Run these commands from a terminal. Replace placeholders with paths and
filenames for your environment.

### 4.1 Rebuild

``` bash
apktool b <decompiled_folder> -o Patched_App.apk
```

### 4.2 Zipalign

Use `zipalign` from the installed Android SDK Build Tools:

``` bash
zipalign -v -p 4 Patched_App.apk App_Aligned.apk
```

### 4.3 Sign

Sign with a keystore you control:

``` bash
apksigner sign --ks my-release-key.keystore --out App_Final.apk App_Aligned.apk
```

If you do not already have a test keystore, create one:

``` bash
keytool -genkey -v \
  -keystore my-release-key.keystore \
  -alias alias_name \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Verify the signature:

``` bash
apksigner verify --verbose App_Final.apk
```

**Installation note:** A rebuilt APK signed with a different key
generally cannot update the original installation. Back up any needed
test data before uninstalling the original app. Uninstalling may erase
app-local data.

## Step 5: Install and verify

1.  Install the rebuilt APK on a test device or emulator.
2.  Launch the app and cause the target child process to start.
3.  Check the process list and logs for startup or library-loading
    errors.

For a Frida Gadget configured to listen on port `27043`, forward the
port:

``` bash
adb forward tcp:27043 tcp:27043
```

Then connect with a compatible Frida client:

``` bash
frida -H 127.0.0.1:27043 -n Gadget
```

The exact process name and connection behavior can vary by Frida version
and Gadget configuration. Consult the documentation for the version in
use if the connection command does not attach.

For a custom native diagnostic library, check the output location
documented by that library. Do not assume it can write to arbitrary
paths: Android sandboxing and scoped-storage restrictions may apply.

## Troubleshooting checklist

  -----------------------------------------------------------------------
  Symptom                             Things to check
  ----------------------------------- -----------------------------------
  `UnsatisfiedLinkError`              Library filename, ABI, dependent
                                      native libraries, and library
                                      search path

  Provider class not found            Smali package path, DEX placement,
                                      class descriptor, and manifest
                                      class name

  Provider authority conflict         Ensure the authority is unique

  Provider starts in the wrong        Check the manifest's
  process                             `android:process` value and actual
                                      process name

  App crashes during startup          Inspect `adb logcat`; verify the
                                      library can safely initialize at
                                      provider startup

  Frida cannot connect                Confirm Gadget started, the
                                      configured port, ADB forwarding,
                                      and client/Gadget compatibility

  APK will not install as an update   The signing certificate differs;
                                      uninstall the prior build or sign
                                      with the same key

  Native library is not found         Confirm the library is packaged
                                      under the correct ABI directory and
                                      uses the expected filename
  -----------------------------------------------------------------------

## Technical explanation

Android starts application processes through the system
process-management infrastructure. During application startup, the
framework discovers and initializes declared content providers before
calling the application's `Application.onCreate()` method.

With a provider declaration that specifies a private process such as
`:UnityKillsMe`, Android creates or uses that process for the provider.
When the provider class is initialized, its static initializer
(`<clinit>`) runs. The initializer calls:

``` java
System.loadLibrary("frida-gadget");
```

The runtime then attempts to load the corresponding native library into
that process. This makes the library available in the child process
rather than relying on code that runs only in the main process.

### Important technical caveats

-   A static initializer runs when the class is initialized, not merely
    because its file exists. The provider must be instantiated by
    Android for this mechanism to run.
-   Provider startup ordering is early in application startup, but do
    not assume it precedes every piece of framework or native
    initialization.
-   The library must support the process ABI and Android version, and
    all required native dependencies must be available.
-   A library may not be safe to initialize before the game engine or
    other app components are ready. Early loading can cause crashes or
    undefined behavior.
-   This technique loads a library into the provider's process. It does
    not automatically load it into every process used by the app.
-   Repacking can break signature-based integrity checks, Play
    Integrity-dependent behavior, anti-tamper mechanisms, or app
    updates.

## End-to-end workflow summary

1.  Decompile the APK.
2.  Add the `FridaLoader.smali` provider class in a Smali source
    directory.
3.  Register the provider in `AndroidManifest.xml` with the intended
    child-process name.
4.  Add the ABI-compatible `.so` library and, if needed, its Gadget
    configuration.
5.  Rebuild the APK with `apktool`.
6.  Align it with `zipalign`.
7.  Sign it with `apksigner` and verify the signature.
8.  Install the test build, launch the target process, and inspect logs.
9.  Verify the library is loaded using the appropriate diagnostic
    method.

------------------------------------------------------------------------

**Use only in an authorized test environment.** Keep a clean copy of the
original APK and record the exact library version, ABI, process name,
and signing key used for each test build.
