import React, { useState, useRef, useEffect } from "react";
import * as fabric from "fabric"; // v6

interface ImageItem {
  id: string;
  file: File;
  url: string;
  caption: {
    zh: string;
    jp: string;
  };
  originalId?: string; // 新增：记录原始图片的ID，用于复制的图片
}

function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false); // 新增：控制复制模态框显示
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const id = Date.now().toString() + Math.random().toString(36);
        const url = URL.createObjectURL(file);

        const newImage: ImageItem = {
          id,
          file,
          url,
          caption: {
            zh: "",
            jp: "",
          },
        };

        setImages((prev) => [...prev, newImage]);
      }
    });
  };

  // 新增：复制图片的函数
  const copyImage = (originalImage: ImageItem) => {
    const id = Date.now().toString() + Math.random().toString(36);

    const copiedImage: ImageItem = {
      id,
      file: originalImage.file,
      url: originalImage.url, // 引用相同的URL
      caption: {
        zh: originalImage.caption.zh, // 复制字幕
        jp: originalImage.caption.jp,
      },
      originalId: originalImage.originalId || originalImage.id, // 记录原始图片ID
    };

    setImages((prev) => [...prev, copiedImage]);
    setShowCopyModal(false);
    setPreviewUrl(""); // 清除预览，需要重新生成
  };

  const updateCaption = (id: string, lang: "zh" | "jp", value: string) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? { ...img, caption: { ...img.caption, [lang]: value } }
          : img
      )
    );
  };

  const removeImage = (id: string) => {
    const imageToRemove = images.find((img) => img.id === id);
    // 只有当这是最后一个使用该URL的图片時才释放对象URL
    const sameUrlCount = images.filter(
      (img) => img.url === imageToRemove?.url
    ).length;
    if (imageToRemove && sameUrlCount === 1) {
      URL.revokeObjectURL(imageToRemove.url);
    }
    setImages((prev) => prev.filter((img) => img.id !== id));
    setPreviewUrl("");
  };

  const addImageClick = () => {
    fileInputRef.current?.click();
  };

  // 新增：显示复制模态框
  const showCopyImageModal = () => {
    if (images.length === 0) {
      alert("请先上传至少一张图片");
      return;
    }
    setShowCopyModal(true);
  };

  const loadFabricImage = (src: string): Promise<fabric.FabricImage> => {
    return new Promise((resolve, reject) => {
      fabric.FabricImage.fromURL(src, {
        crossOrigin: "anonymous",
      })
        .then((img) => {
          if (img) {
            resolve(img);
          } else {
            reject(new Error("Failed to load image"));
          }
        })
        .catch(reject);
    });
  };

  const generatePreview = async () => {
    if (images.length === 0) return;

    setIsGenerating(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }

      const loadedImages = await Promise.all(
        images.map((img) => loadFabricImage(img.url))
      );

      // 统一宽度为800px
      const CANVAS_WIDTH = 800;

      // 计算第一张图片的高度
      const firstImage = loadedImages[0];
      const firstImageScale = CANVAS_WIDTH / (firstImage.width || 1);
      const firstImageHeight = (firstImage.height || 600) * firstImageScale;

      // 字幕区域固定高度：第一张图片高度的15%，最小80px，最大120px
      const CAPTION_HEIGHT = Math.min(
        Math.max(firstImageHeight * 0.15, 80),
        120
      );

      // 计算总高度：第一张图片完整高度 + 其他图片的字幕区域高度
      const totalHeight =
        firstImageHeight + (images.length - 1) * CAPTION_HEIGHT;

      // 设置canvas
      canvas.width = CANVAS_WIDTH;
      canvas.height = totalHeight;

      const fabricCanvas = new fabric.Canvas(canvas, {
        width: CANVAS_WIDTH,
        height: totalHeight,
        backgroundColor: "white",
      });

      fabricCanvasRef.current = fabricCanvas;

      let currentY = 0;

      for (let i = 0; i < loadedImages.length; i++) {
        const img = loadedImages[i];
        const imageData = images[i];

        if (i === 0) {
          // 第一张图片完整显示
          img.set({
            left: 0,
            top: currentY,
            scaleX: CANVAS_WIDTH / (img.width || 1),
            scaleY: firstImageHeight / (img.height || 1),
            selectable: false,
          });

          fabricCanvas.add(img);
          currentY += firstImageHeight;
        } else {
          // 其他图片只显示底部15%
          const clonedImg = await img.clone();
          const imgScale = CANVAS_WIDTH / (img.width || 1);
          const fullScaledHeight = (img.height || 600) * imgScale;

          // 图片位置：让图片底部对齐字幕区域底部
          const imgTop = currentY + CAPTION_HEIGHT - fullScaledHeight;

          clonedImg.set({
            left: 0,
            top: imgTop,
            scaleX: imgScale,
            scaleY: imgScale,
            selectable: false,
          });

          // 裁切：只显示字幕区域
          const clipRect = new fabric.Rect({
            left: 0,
            top: currentY,
            width: CANVAS_WIDTH,
            height: CAPTION_HEIGHT,
            absolutePositioned: true,
          });

          clonedImg.set({ clipPath: clipRect });
          fabricCanvas.add(clonedImg);

          currentY += CAPTION_HEIGHT;
        }

        // 添加字幕（统一字体大小）
        if (imageData.caption.zh || imageData.caption.jp) {
          const sectionTop =
            i === 0 ? currentY - firstImageHeight : currentY - CAPTION_HEIGHT;
          const sectionHeight = i === 0 ? firstImageHeight : CAPTION_HEIGHT;

          // 中文字幕
          if (imageData.caption.zh) {
            const zhTop =
              sectionTop + sectionHeight - (imageData.caption.jp ? 65 : 55);

            // 背景文字（稍大一点）
            const zhBackgroundText = new fabric.FabricText(
              imageData.caption.zh,
              {
                left: CANVAS_WIDTH / 2,
                top: zhTop, // 与主文字相同位置，不偏移
                fontSize: 36,
                fontFamily: "Yuanti, Noto Sans TC, sans-serif",
                fontWeight: "bold",
                fill: "#003153", // 深蓝色作为背景
                textAlign: "center",
                originX: "center",
                selectable: false,
                opacity: 0.8, // 稍微透明
                shadow: new fabric.Shadow({
                  color: "#003153",
                  blur: 2,
                  offsetX: -1,
                  offsetY: -1,
                }),
              }
            );
            fabricCanvas.add(zhBackgroundText);

            // 主文字
            const zhText = new fabric.FabricText(imageData.caption.zh, {
              left: CANVAS_WIDTH / 2,
              top: zhTop,
              fontSize: 36, // 统一字体大小
              fontFamily: "Yuanti, Noto Sans TC, sans-serif",
              fontWeight: "bold",
              fill: "white",
              textAlign: "center",
              originX: "center",
              selectable: false,
              shadow: new fabric.Shadow({
                color: "#003153",
                blur: 2,
                offsetX: 2,
                offsetY: 2,
              }),
            });
            fabricCanvas.add(zhText);
          }

          // 日语字幕
          if (imageData.caption.jp) {
            const jpText = new fabric.FabricText(imageData.caption.jp, {
              left: CANVAS_WIDTH / 2,
              top: sectionTop + sectionHeight - 25,
              fontSize: 20, // 统一字体大小
              fontFamily: "Noto Sans JP, sans-serif",
              fontWeight: "normal",
              fill: "white",
              textAlign: "center",
              originX: "center",
              selectable: false,
              shadow: new fabric.Shadow({
                color: "#000000",
                blur: 0,
                offsetX: 1,
                offsetY: 1,
              }),
            });
            fabricCanvas.add(jpText);
          }
        }
      }

      fabricCanvas.renderAll();

      setTimeout(() => {
        const dataUrl = fabricCanvas.toDataURL({
          multiplier: 1,
          format: "png",
          quality: 0.9,
        });
        setPreviewUrl(dataUrl);
        setIsGenerating(false);
      }, 100);
    } catch (error) {
      console.error("生成预览时出错:", error);
      setIsGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!previewUrl) return;

    const link = document.createElement("a");
    link.download = `拼接图片_${new Date().getTime()}.png`;
    link.href = previewUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }
    };
  }, []);

  return (
    <div className=" bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">上传图片</h2>

              <div className="space-y-3">
                <button
                  onClick={addImageClick}
                  className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  点击选择图片 / Click to select images
                </button>

                <button
                  onClick={showCopyImageModal}
                  className="w-full py-3 px-4 bg-blue-50 border-2 border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                >
                  复制已有图片 / Copy existing image
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />

              {images.length > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  第一张图片完整显示，其他图片显示底部15%区域
                  <br />
                  <span className="text-blue-600">
                    ✨ 已上传 {images.length} 张图片
                  </span>
                </p>
              )}
            </div>

            {images.map((image, index) => (
              <div key={image.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-medium">
                    图片 {index + 1} {index === 0 && "(完整显示)"}
                    {image.originalId && (
                      <span className="text-blue-600 text-sm ml-2">(复制)</span>
                    )}
                  </h3>
                  <button
                    onClick={() => removeImage(image.id)}
                    className="text-red-500 hover:text-red-700 text-sm cursor-pointer"
                  >
                    移除
                  </button>
                </div>

                <div className="mb-4">
                  <img
                    src={image.url}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-32 object-cover rounded border"
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      中文字幕
                    </label>
                    <input
                      type="text"
                      value={image.caption.zh}
                      onChange={(e) =>
                        updateCaption(image.id, "zh", e.target.value)
                      }
                      placeholder="输入中文字幕..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-text"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      日语字幕
                    </label>
                    <input
                      type="text"
                      value={image.caption.jp}
                      onChange={(e) =>
                        updateCaption(image.id, "jp", e.target.value)
                      }
                      placeholder="日本語字幕を入力..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-text"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">预览</h2>

            <div className="border-2 border-gray-200 rounded-lg p-4 min-h-96">
              {images.length === 0 ? (
                <div className="flex items-center justify-center h-96">
                  <p className="text-gray-500">请上传图片以查看预览</p>
                </div>
              ) : isGenerating ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-gray-500">生成预览中...</p>
                  </div>
                </div>
              ) : previewUrl ? (
                <div className="text-center">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-w-full h-auto border rounded shadow-sm"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-96">
                  <p className="text-gray-500">
                    点击「生成预览」按钮来查看效果
                  </p>
                </div>
              )}
            </div>

            {images.length > 0 && (
              <div className="mt-4 space-y-2">
                <button
                  onClick={generatePreview}
                  disabled={isGenerating}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 cursor-pointer"
                >
                  {isGenerating ? "生成中..." : "生成预览"}
                </button>
                {previewUrl && (
                  <button
                    onClick={downloadImage}
                    className="w-full bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors font-medium cursor-pointer"
                  >
                    下载拼接图片
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {/* 新增：复制图片模态框 */}
        {showCopyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-96 overflow-y-auto mx-4">
              <h3 className="text-lg font-semibold mb-4">选择要复制的图片</h3>

              <div className="grid grid-cols-2 gap-4 mb-4">
                {images.map((image, index) => (
                  <div
                    key={image.id}
                    onClick={() => copyImage(image)}
                    className="border-2 border-gray-200 rounded-lg p-3 hover:border-blue-400 cursor-pointer transition-colors"
                  >
                    <img
                      src={image.url}
                      alt={`Image ${index + 1}`}
                      className="w-full h-24 object-cover rounded mb-2"
                    />
                    <p className="text-sm text-gray-600 text-center">
                      图片 {index + 1}
                      {image.originalId && (
                        <span className="text-blue-600"> (复制)</span>
                      )}
                    </p>
                    {(image.caption.zh || image.caption.jp) && (
                      <div className="text-xs text-gray-500 mt-1">
                        {image.caption.zh && <div>中: {image.caption.zh}</div>}
                        {image.caption.jp && <div>日: {image.caption.jp}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowCopyModal(false)}
                className="w-full py-2 px-4 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
