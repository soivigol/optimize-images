#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const glob = require('glob');
const { promisify } = require('util');
const imagemin = require('imagemin');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const imageminGifsicle = require('imagemin-gifsicle');
const imageminSvgo = require('imagemin-svgo');
const imageminWebp = require('imagemin-webp');

const globPromise = promisify(glob);
const MAX_WIDTH = 2500;

// Supported image formats
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

async function processImage(imagePath) {
  try {
    const extension = path.extname(imagePath).toLowerCase();
    
    if (!IMAGE_EXTENSIONS.includes(extension)) {
      return;
    }
    
    console.log(`Processing: ${imagePath}`);
    
    // Get image metadata
    const metadata = await sharp(imagePath).metadata();
    
    // Skip if image width is already below the threshold
    if (metadata.width <= MAX_WIDTH) {
      console.log(`  - Width (${metadata.width}px) already <= ${MAX_WIDTH}px, optimizing only`);
    } else {
      console.log(`  - Resizing from ${metadata.width}px to ${MAX_WIDTH}px`);
    }
    
    // Create a temporary file path
    const tempPath = imagePath + '.temp';
    
    // Resize the image if needed, maintaining aspect ratio
    if (metadata.width > MAX_WIDTH) {
      await sharp(imagePath)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .toFile(tempPath);
      
      // Replace the original with the resized version
      fs.unlinkSync(imagePath);
      fs.renameSync(tempPath, imagePath);
    }
    
    // Optimize the image based on its format
    if (['.jpg', '.jpeg', '.png', '.gif', '.svg'].includes(extension)) {
      const originalSize = fs.statSync(imagePath).size;
      
      const plugins = [];
      
      if (['.jpg', '.jpeg'].includes(extension)) {
        plugins.push(imageminMozjpeg({ quality: 80 }));
      } else if (extension === '.png') {
        plugins.push(imageminPngquant({ quality: [0.65, 0.8] }));
      } else if (extension === '.gif') {
        plugins.push(imageminGifsicle());
      } else if (extension === '.svg') {
        plugins.push(imageminSvgo());
      } else if (extension === '.webp') {
        plugins.push(imageminWebp({ quality: 80 }));
      }
      
      if (plugins.length > 0) {
        const optimizedBuffer = await imagemin.buffer(fs.readFileSync(imagePath), {
          plugins
        });
        
        // Only write if optimization actually reduced the size
        if (optimizedBuffer.length < originalSize) {
          fs.writeFileSync(imagePath, optimizedBuffer);
          const newSize = fs.statSync(imagePath).size;
          const savedPercentage = ((originalSize - newSize) / originalSize * 100).toFixed(2);
          console.log(`  - Optimized: ${(originalSize / 1024).toFixed(2)}KB → ${(newSize / 1024).toFixed(2)}KB (${savedPercentage}% saved)`);
        } else {
          console.log(`  - Optimization did not reduce size, keeping original`);
        }
      }
    }
    
    console.log(`  - Completed processing ${imagePath}`);
  } catch (error) {
    console.error(`Error processing ${imagePath}: ${error.message}`);
  }
}

async function findAndProcessImages() {
  try {
    // Get all image files recursively from the current directory
    const imagePatterns = IMAGE_EXTENSIONS.map(ext => `**/*${ext}`);
    const imageFiles = [];
    
    for (const pattern of imagePatterns) {
      const files = await globPromise(pattern, { nocase: true, absolute: true });
      imageFiles.push(...files);
    }
    
    console.log(`Found ${imageFiles.length} image files to process`);
    
    // Process each image
    let completed = 0;
    for (const imagePath of imageFiles) {
      await processImage(imagePath);
      completed++;
      console.log(`Progress: ${completed}/${imageFiles.length} (${Math.round(completed / imageFiles.length * 100)}%)`);
    }
    
    console.log('All images have been processed!');
  } catch (error) {
    console.error(`Error finding or processing images: ${error.message}`);
  }
}

// Execute the main function
findAndProcessImages().catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
}); 