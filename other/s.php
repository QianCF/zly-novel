<?php
/**
 * 枚举 dist 文件夹里所有 HTML 文件，并将所有以 dist/ 开头的相对路径写入 a.txt
 * 
 * 使用方法：
 * 1. 将本脚本放在 dist 文件夹的上级目录（或任意位置，需调整 $baseDir 路径）
 * 2. 命令行运行：php script.php
 * 3. 或者通过浏览器访问（需配置Web服务器）
 */

// ==================== 配置区域 ====================
$baseDir = __DIR__ . '/dist';  // dist 文件夹的绝对路径，可根据需要修改
$outputFile = __DIR__ . '/a.txt';  // 输出文件路径
$prefix = 'dist/';  // 要匹配的路径前缀
// ================================================

// 检查 dist 文件夹是否存在
if (!is_dir($baseDir)) {
    die("错误：目录 '{$baseDir}' 不存在！\n");
}

// 递归获取所有 HTML 文件
$htmlFiles = [];
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($baseDir, RecursiveDirectoryIterator::SKIP_DOTS)
);

foreach ($iterator as $file) {
    if ($file->isFile() && strtolower($file->getExtension()) === 'html') {
        // 获取相对于 dist 文件夹的路径
        $relativePath = substr($file->getPathname(), strlen($baseDir) + 1);
        // 将 Windows 反斜杠转为正斜杠，统一路径格式
        $relativePath = str_replace('\\', '/', $relativePath);
        $htmlFiles[] = $prefix . $relativePath;
    }
}

// 排序（可选，便于阅读）
sort($htmlFiles);

// 写入文件（覆盖写入）
if (file_put_contents($outputFile, implode(PHP_EOL, $htmlFiles)) !== false) {
    echo "成功！共找到 " . count($htmlFiles) . " 个 HTML 文件，路径已写入：{$outputFile}\n";
} else {
    die("错误：无法写入文件 {$outputFile}，请检查目录权限！\n");
}

// 可选：显示部分结果预览
if (count($htmlFiles) > 0) {
    echo "\n预览（前5条）：\n";
    foreach (array_slice($htmlFiles, 0, 5) as $path) {
        echo "  - {$path}\n";
    }
    if (count($htmlFiles) > 5) {
        echo "  ... 共 " . count($htmlFiles) . " 条\n";
    }
}